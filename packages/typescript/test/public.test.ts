import { describe, expect, it } from "vitest";

import {
  parseMachineId,
  parsePublicId,
  publicIdFromMachineId,
} from "../src/index.js";

describe("public identifiers", () => {
  const machineId = parseMachineId("0188bac7-4afa-78aa-bc3b-bd1eef28d881");
  const publicId = "prefix_01h2xcejqtf2nbrexx3vqjhp41";

  it("encodes the upstream TypeID v0.3 UUID vector exactly", () => {
    expect(publicIdFromMachineId(machineId, "prefix")).toBe(publicId);
  });

  it("decodes a PID to the same UUIDv7 bits and namespace", () => {
    expect(parsePublicId(publicId)).toEqual({
      value: publicId,
      namespace: "prefix",
      machineId,
    });
  });

  it("rejects a PID containing a non-v7 UUID", () => {
    expect(() => parsePublicId("prefix_7mfb0gpp6c8dsaasre0asc7n3s")).toThrow(
      expect.objectContaining({ code: "invalid_uuid_version" }),
    );
  });

  it("rejects non-canonical uppercase input", () => {
    expect(() => parsePublicId(publicId.toUpperCase())).toThrow(
      expect.objectContaining({ code: "invalid_pid" }),
    );
  });

  it("rejects a namespace mismatch when one is required", () => {
    expect(() => parsePublicId(publicId, "order")).toThrow(
      expect.objectContaining({ code: "invalid_public_prefix" }),
    );
  });

  it("rejects an invalid namespace during PID encoding", () => {
    expect(() => publicIdFromMachineId(machineId, "Invalid Prefix")).toThrow(
      expect.objectContaining({ code: "invalid_public_prefix" }),
    );
  });

  it("rejects malformed lowercase PID input", () => {
    expect(() => parsePublicId("prefix_not-a-typeid")).toThrow(
      expect.objectContaining({ code: "invalid_pid" }),
    );
  });

  it("rejects a TypeID without an Identifold namespace", () => {
    expect(() => parsePublicId("01h2xcejqtf2nbrexx3vqjhp41")).toThrow(
      expect.objectContaining({ code: "invalid_public_prefix" }),
    );
  });
});
