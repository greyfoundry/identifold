import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  calculateReferenceCheckSymbol,
  createNamespaceRegistry,
  createReferenceCandidate,
  normalizeReference,
  parseReference,
} from "../src/index.js";

describe("human references", () => {
  const registry = createNamespaceRegistry([
    {
      publicPrefix: "order",
      reference: { prefix: "ORD", strategy: "random" },
    },
    {
      publicPrefix: "ticket",
      reference: {
        prefix: "TKT",
        profile: "compact",
        strategy: "random",
      },
    },
  ]);

  it.each([
    ["0", "0"],
    ["1", "1"],
    ["2", "2"],
    ["3", "3"],
    ["4", "4"],
    ["5", "5"],
    ["6", "6"],
    ["7", "7"],
    ["8", "8"],
    ["9", "9"],
    ["A", "A"],
    ["B", "B"],
    ["C", "C"],
    ["D", "D"],
    ["E", "E"],
    ["F", "F"],
    ["G", "G"],
    ["H", "H"],
    ["J", "J"],
    ["K", "K"],
    ["M", "M"],
    ["N", "N"],
    ["P", "P"],
    ["Q", "Q"],
    ["R", "R"],
    ["S", "S"],
    ["T", "T"],
    ["V", "V"],
    ["W", "W"],
    ["X", "X"],
    ["Y", "Y"],
    ["Z", "Z"],
    ["10", "*"],
    ["11", "~"],
    ["12", "$"],
    ["13", "="],
    ["14", "U"],
  ])("calculates modulo-37 check symbol %s -> %s", (payload, check) => {
    expect(calculateReferenceCheckSymbol(payload)).toBe(check);
  });

  it("formats a deterministic standard-profile candidate", () => {
    const randomBytes = () => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    expect(createReferenceCandidate(registry, "order", { randomBytes })).toBe(
      "ORD-0123-4567-89-P",
    );
  });

  it("generates a valid candidate with platform cryptographic randomness", () => {
    expect(createReferenceCandidate(registry, "order")).toMatch(
      /^ORD-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}-[0-9A-HJKMNP-TV-Z*~$=U]$/,
    );
  });

  it("uses the registered compact profile length", () => {
    const randomBytes = () => Uint8Array.from([31, 31, 31, 31, 31, 31, 31, 31]);

    expect(createReferenceCandidate(registry, "ticket", { randomBytes })).toBe(
      "TKT-ZZZZ-ZZZZ-F",
    );
  });

  it("parses canonical input into structured details", () => {
    expect(parseReference("ORD-7K4M-2P8Q-3D-9", registry)).toEqual({
      value: "ORD-7K4M-2P8Q-3D-9",
      namespace: "order",
      payload: "7K4M2P8Q3D",
      checkSymbol: "9",
      strategy: "random",
    });
  });

  it("normalizes lowercase, hyphenless, and Crockford payload aliases", () => {
    expect(normalizeReference("ordol00000000g", registry)).toBe(
      "ORD-0100-0000-00-G",
    );
  });

  it("rejects an incorrect check symbol", () => {
    expect(() => parseReference("ORD-7K4M-2P8Q-3D-K", registry)).toThrow(
      expect.objectContaining({ code: "invalid_checksum" }),
    );
  });

  it("rejects symbols outside the payload alphabet", () => {
    expect(() => parseReference("ORD-7K4M-2P8U-3D-9", registry)).toThrow(
      expect.objectContaining({ code: "invalid_ref_symbol" }),
    );
  });

  it("rejects invalid direct checksum payloads", () => {
    expect(() => calculateReferenceCheckSymbol("")).toThrow(
      expect.objectContaining({ code: "invalid_ref_length" }),
    );
    expect(() => calculateReferenceCheckSymbol("U")).toThrow(
      expect.objectContaining({ code: "invalid_ref_symbol" }),
    );
  });

  it("rejects an invalid check symbol", () => {
    expect(() => parseReference("ORD-7K4M-2P8Q-3D-I", registry)).toThrow(
      expect.objectContaining({ code: "invalid_ref_symbol" }),
    );
  });

  it("rejects a payload with the wrong registered length", () => {
    expect(() => parseReference("ORD-7K4M-2P8Q-9", registry)).toThrow(
      expect.objectContaining({ code: "invalid_ref_length" }),
    );
  });

  it("rejects non-canonical partial hyphenation", () => {
    expect(() => parseReference("ORD-7K4M2P8Q3D-9", registry)).toThrow(
      expect.objectContaining({ code: "invalid_ref" }),
    );
  });

  it("rejects wrong group widths even when the group count matches", () => {
    expect(() => parseReference("ORD-7K-4M2P8Q-3D-9", registry)).toThrow(
      expect.objectContaining({ code: "invalid_ref" }),
    );
  });

  it("rejects an unknown REF namespace", () => {
    expect(() => parseReference("INV-7K4M-2P8Q-3D-9", registry)).toThrow(
      expect.objectContaining({ code: "unknown_namespace" }),
    );
  });

  it.each(["", "ORD-!", `ORD-${"0".repeat(101)}`])(
    "rejects malformed REF input %s",
    (value) => {
      expect(() => parseReference(value, registry)).toThrow(
        expect.objectContaining({ code: "invalid_ref" }),
      );
    },
  );

  it("rejects invalid random byte sources", () => {
    expect(() =>
      createReferenceCandidate(registry, "order", {
        randomBytes: () => new Uint8Array(9),
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_random_source" }));
    expect(() =>
      createReferenceCandidate(registry, "order", {
        randomBytes: () => [] as unknown as Uint8Array,
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_random_source" }));
  });

  it("rejects candidate generation for unknown and unsupported namespaces", () => {
    expect(() => createReferenceCandidate(registry, "missing")).toThrow(
      expect.objectContaining({ code: "unknown_namespace" }),
    );
    const unsupported = createNamespaceRegistry([
      { publicPrefix: "plain" },
      {
        publicPrefix: "invoice",
        reference: { prefix: "INV", strategy: "sequence", width: 6 },
      },
    ]);
    expect(() => createReferenceCandidate(unsupported, "plain")).toThrow(
      expect.objectContaining({ code: "invalid_namespace_definition" }),
    );
    expect(() => createReferenceCandidate(unsupported, "invoice")).toThrow(
      expect.objectContaining({ code: "invalid_namespace_definition" }),
    );
    expect(() => parseReference("INV-0000-01-1", unsupported)).toThrow(
      expect.objectContaining({ code: "invalid_namespace_definition" }),
    );
  });

  it("rejects an unknown hyphenless REF namespace", () => {
    expect(() => parseReference("INV7K4M2P8Q3D9", registry)).toThrow(
      expect.objectContaining({ code: "unknown_namespace" }),
    );
  });

  it("round-trips generated standard-profile references", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 10, maxLength: 10 }),
        (randomBytes) => {
          const reference = createReferenceCandidate(registry, "order", {
            randomBytes: () => randomBytes,
          });
          const parsed = parseReference(reference, registry);

          expect(parsed.value).toBe(reference);
          expect(normalizeReference(reference, registry)).toBe(reference);
        },
      ),
    );
  });

  it("detects every generated reference with a changed check symbol", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 10, maxLength: 10 }),
        (randomBytes) => {
          const reference = createReferenceCandidate(registry, "order", {
            randomBytes: () => randomBytes,
          });
          const replacement = reference.endsWith("0") ? "1" : "0";
          const corrupted = `${reference.slice(0, -1)}${replacement}`;

          expect(() => parseReference(corrupted, registry)).toThrow(
            expect.objectContaining({ code: "invalid_checksum" }),
          );
        },
      ),
    );
  });
});
