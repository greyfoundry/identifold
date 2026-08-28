import { describe, expect, it } from "vitest";

import { parseMachineId } from "../src/index.js";
import { inspectLegacyIdentifier, planLegacyMigration } from "../src/legacy.js";

describe("legacy migration", () => {
  it.each([
    ["f47ac10b-58cc-4372-a567-0e02b2c3d479", "uuidv4"],
    ["1842", "integer"],
    ["01ARZ3NDEKTSV4RRFFQ69G5FAV", "ulid"],
    ["V1StGXR8_Z5jdHi6B-myT", "nanoid"],
    ["old_customer_42", "short-code"],
  ] as const)("classifies %s as %s", (value, kind) => {
    expect(inspectLegacyIdentifier(value)).toEqual({ kind, value });
  });

  it.each([
    "",
    "01ARZ3NDEKTSV4RRFFQ69G5FAI",
    "contains spaces",
    "x".repeat(101),
  ])("rejects invalid or ambiguous legacy input", (value) => {
    expect(() => inspectLegacyIdentifier(value)).toThrow(
      expect.objectContaining({ code: "invalid_kind" }),
    );
  });

  it("plans a stored alias without replacing the original", () => {
    const machineId = parseMachineId("01890a5d-ac96-774b-bf20-69de2b531a31");
    const plan = planLegacyMigration("1842", "customer", () => machineId);
    expect(plan).toEqual({
      aliasRequired: true,
      legacy: { kind: "integer", value: "1842" },
      machineId,
      namespace: "customer",
      relationships: {
        legacyToMachineId: "stored",
        machineIdToPublicId: "deterministic",
      },
    });
  });
});
