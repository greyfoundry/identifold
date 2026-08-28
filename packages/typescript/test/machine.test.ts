import { describe, expect, it } from "vitest";

import { createMachineId, parseMachineId } from "../src/index.js";

describe("machine identifiers", () => {
  it("creates a canonical RFC 9562 UUIDv7", () => {
    expect(createMachineId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("normalizes an uppercase UUIDv7 to canonical lowercase", () => {
    expect(parseMachineId("0188BAC7-4AFA-78AA-BB3B-BD1EEF28D881")).toBe(
      "0188bac7-4afa-78aa-bb3b-bd1eef28d881",
    );
  });

  it("rejects a valid UUID with a non-v7 version", () => {
    expect(() =>
      parseMachineId("f47ac10b-58cc-4372-a567-0e02b2c3d479"),
    ).toThrow(expect.objectContaining({ code: "invalid_uuid_version" }));
  });

  it("rejects malformed UUID input", () => {
    expect(() => parseMachineId("not-a-uuid")).toThrow(
      expect.objectContaining({ code: "invalid_mid" }),
    );
  });
});
