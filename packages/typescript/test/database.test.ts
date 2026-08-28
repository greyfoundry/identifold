import { describe, expect, it } from "vitest";

import {
  createMachineId,
  createNamespaceRegistry,
  createReferenceCandidate,
} from "../src/index.js";
import {
  createDatabaseReferenceStore,
  createDatabaseSequenceAllocator,
} from "../src/database.js";
import { createDrizzleReferenceStore } from "../src/drizzle.js";

const registry = createNamespaceRegistry([
  { publicPrefix: "order", reference: { prefix: "ORD", strategy: "random" } },
]);
const reservation = {
  machineId: createMachineId(),
  namespace: "order",
  reference: createReferenceCandidate(registry, "order", {
    randomBytes: (size) => new Uint8Array(size),
  }),
};
const allocation = {
  machineId: createMachineId(),
  namespace: "invoice",
  referencePrefix: "INV",
  scope: null,
  width: 6,
};

describe("database adapter contracts", () => {
  it("rejects malformed and failed reservation results", async () => {
    await expect(
      createDatabaseReferenceStore(() => Promise.resolve([])).reserve(
        reservation,
      ),
    ).rejects.toMatchObject({ code: "allocation_conflict" });
    await expect(
      createDatabaseReferenceStore(() =>
        Promise.reject(new Error("offline")),
      ).reserve(reservation),
    ).rejects.toMatchObject({
      code: "allocation_conflict",
      message: "Database allocation could not be committed",
    });
  });

  it.each([
    [1n, 1n],
    [2, 2n],
    ["3", 3n],
  ] as const)(
    "accepts supported sequence result %s",
    async (sequence, expected) => {
      await expect(
        createDatabaseSequenceAllocator(() =>
          Promise.resolve([{ sequence }]),
        ).allocate(allocation),
      ).resolves.toBe(expected);
    },
  );

  it.each([
    [{ code: "22003" }, "sequence_overflow"],
    [{ code: "22023" }, "invalid_allocation_policy"],
    [{ code: 22_003 }, "allocation_conflict"],
    [null, "allocation_conflict"],
  ] as const)("maps database failure %j", async (failure, code) => {
    const error = Object.assign(new Error("database failure"), failure ?? {});
    await expect(
      createDatabaseSequenceAllocator(() => Promise.reject(error)).allocate(
        allocation,
      ),
    ).rejects.toMatchObject({ code });
  });

  it("rejects unsafe and malformed sequence values", async () => {
    for (const sequence of [Number.MAX_SAFE_INTEGER + 1, "-1", undefined]) {
      await expect(
        createDatabaseSequenceAllocator(() =>
          Promise.resolve([{ sequence }]),
        ).allocate(allocation),
      ).rejects.toMatchObject({ code: "allocation_conflict" });
    }
  });

  it("accepts array-shaped Drizzle results and rejects unknown shapes", async () => {
    await expect(
      createDrizzleReferenceStore({
        execute: () => Promise.resolve([{ reserved: true }]),
      }).reserve(reservation),
    ).resolves.toBe(true);
    await expect(
      createDrizzleReferenceStore({
        execute: () => Promise.resolve("invalid"),
      }).reserve(reservation),
    ).rejects.toMatchObject({ code: "allocation_conflict" });
  });
});
