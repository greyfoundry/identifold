import { expect, test } from "vitest";

import type { HumanReference, MachineId } from "../src/index.js";
import { createStorageAdapter } from "../src/storage.js";

const machineId = "01890f8c-7b2a-7cc3-98b0-112233445566" as MachineId;
const reference = "ORD-0123-4567-89-P" as HumanReference;

test("a storage adapter exposes reservation, resolution, and allocation", async () => {
  const adapter = createStorageAdapter({
    referenceStore: { reserve: () => Promise.resolve(true) },
    lookup: () => Promise.resolve({ machineId, namespace: "order" }),
    sequenceAllocator: { allocate: () => Promise.resolve(1n) },
  });

  await expect(
    adapter.referenceStore.reserve({
      machineId,
      namespace: "order",
      reference,
    }),
  ).resolves.toBe(true);
  await expect(adapter.lookup(reference, "order")).resolves.toEqual({
    machineId,
    namespace: "order",
  });
  await expect(
    adapter.sequenceAllocator.allocate({
      machineId,
      namespace: "receipt",
      referencePrefix: "RCT",
      scope: null,
      width: 4,
    }),
  ).resolves.toBe(1n);
});
