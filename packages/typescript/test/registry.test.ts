import { describe, expect, it } from "vitest";

import { createNamespaceRegistry } from "../src/index.js";

describe("namespace registry", () => {
  it("normalizes defaults and protects definitions from caller mutation", () => {
    const input = [
      {
        publicPrefix: "order",
        reference: { prefix: "ORD", strategy: "random" as const },
      },
      { publicPrefix: "audit_event" },
    ];

    const registry = createNamespaceRegistry(input);
    const inputOrder = input[0];
    if (inputOrder?.reference === undefined) {
      throw new Error("Invalid test fixture");
    }
    inputOrder.publicPrefix = "changed";
    inputOrder.reference.prefix = "BAD";

    expect(registry.definitions).toEqual([
      {
        publicPrefix: "order",
        reference: {
          payloadLength: 10,
          prefix: "ORD",
          profile: "standard",
          strategy: "random",
        },
      },
      { publicPrefix: "audit_event" },
    ]);
    const registeredOrder = registry.definitions[0];
    expect(registeredOrder).toBeDefined();
    expect(registry.getByPublicPrefix("order")).toBe(registeredOrder);
    expect(registry.getByReferencePrefix("ord")).toBe(registeredOrder);
    expect(Object.isFrozen(registry.definitions)).toBe(true);
    expect(Object.isFrozen(registeredOrder)).toBe(true);
    expect(Object.isFrozen(registeredOrder?.reference)).toBe(true);
  });

  it.each(["Order", "_order", "order_", "order1", "a".repeat(64)])(
    "rejects invalid TypeID prefix %s",
    (publicPrefix) => {
      expect(() => createNamespaceRegistry([{ publicPrefix }])).toThrow(
        expect.objectContaining({ code: "invalid_public_prefix" }),
      );
    },
  );

  it("rejects duplicate public prefixes", () => {
    expect(() =>
      createNamespaceRegistry([
        { publicPrefix: "order" },
        { publicPrefix: "order" },
      ]),
    ).toThrow(expect.objectContaining({ code: "duplicate_public_prefix" }));
  });

  it.each(["O", "ORDERREFX", "ord", "OR-1"])(
    "rejects invalid REF prefix %s",
    (prefix) => {
      expect(() =>
        createNamespaceRegistry([
          {
            publicPrefix: "order",
            reference: { prefix, strategy: "random" },
          },
        ]),
      ).toThrow(expect.objectContaining({ code: "invalid_ref_prefix" }));
    },
  );

  it("rejects case-insensitive duplicate REF prefixes", () => {
    expect(() =>
      createNamespaceRegistry([
        {
          publicPrefix: "order",
          reference: { prefix: "ORD", strategy: "random" },
        },
        {
          publicPrefix: "shipment",
          reference: { prefix: "ORD", strategy: "random" },
        },
      ]),
    ).toThrow(expect.objectContaining({ code: "duplicate_ref_prefix" }));
  });

  it("rejects REF prefixes that make hyphenless parsing ambiguous", () => {
    expect(() =>
      createNamespaceRegistry([
        {
          publicPrefix: "order",
          reference: { prefix: "ORD", strategy: "random" },
        },
        {
          publicPrefix: "order_export",
          reference: { prefix: "ORDER", strategy: "random" },
        },
      ]),
    ).toThrow(expect.objectContaining({ code: "ambiguous_ref_prefix" }));
  });

  it.each([3, 19])("rejects sequential width %i", (width) => {
    expect(() =>
      createNamespaceRegistry([
        {
          publicPrefix: "invoice",
          reference: { prefix: "INV", strategy: "sequence", width },
        },
      ]),
    ).toThrow(expect.objectContaining({ code: "invalid_ref_length" }));
  });

  it("registers high-entropy and calendar-scoped sequential references", () => {
    const registry = createNamespaceRegistry([
      {
        publicPrefix: "secret",
        reference: { prefix: "SEC", profile: "high", strategy: "random" },
      },
      {
        publicPrefix: "invoice",
        reference: {
          prefix: "INV",
          scope: "calendar-year",
          strategy: "sequence",
          width: 6,
        },
      },
    ]);

    expect(registry.definitions).toEqual([
      {
        publicPrefix: "secret",
        reference: {
          payloadLength: 12,
          prefix: "SEC",
          profile: "high",
          strategy: "random",
        },
      },
      {
        publicPrefix: "invoice",
        reference: {
          prefix: "INV",
          scope: "calendar-year",
          strategy: "sequence",
          width: 6,
        },
      },
    ]);
  });

  it("rejects non-integer sequential widths", () => {
    expect(() =>
      createNamespaceRegistry([
        {
          publicPrefix: "invoice",
          reference: { prefix: "INV", strategy: "sequence", width: 4.5 },
        },
      ]),
    ).toThrow(expect.objectContaining({ code: "invalid_ref_length" }));
  });

  it("rejects unknown profiles and strategies at runtime boundaries", () => {
    expect(() =>
      createNamespaceRegistry([
        {
          publicPrefix: "order",
          reference: {
            prefix: "ORD",
            profile: "unknown",
            strategy: "random",
          } as never,
        },
      ]),
    ).toThrow(
      expect.objectContaining({ code: "invalid_namespace_definition" }),
    );
    expect(() =>
      createNamespaceRegistry([
        {
          publicPrefix: "order",
          reference: { prefix: "ORD", strategy: "custom" } as never,
        },
      ]),
    ).toThrow(
      expect.objectContaining({ code: "invalid_namespace_definition" }),
    );
  });
});
