import { describe, expect, it, vi } from "vitest";

import {
  createMachineId,
  createNamespaceRegistry,
  createReferenceCandidate,
} from "../src/index.js";
import { exportRegistry, importRegistry } from "../src/exchange.js";
import { createReferenceResolver } from "../src/resolver.js";

const registry = createNamespaceRegistry([
  { publicPrefix: "user" },
  {
    publicPrefix: "order",
    reference: { prefix: "ORD", profile: "compact", strategy: "random" },
  },
  {
    publicPrefix: "invoice",
    reference: { prefix: "INV", strategy: "sequence", width: 6 },
  },
]);

describe("advanced extensions", () => {
  it("round-trips a deterministic, immutable registry exchange", () => {
    const exchange = exportRegistry(registry);
    expect(exchange).toEqual({
      version: 1,
      namespaces: [
        { publicPrefix: "user" },
        {
          publicPrefix: "order",
          reference: { prefix: "ORD", profile: "compact", strategy: "random" },
        },
        {
          publicPrefix: "invoice",
          reference: {
            prefix: "INV",
            scope: "none",
            strategy: "sequence",
            width: 6,
          },
        },
      ],
    });
    const imported = importRegistry(JSON.parse(JSON.stringify(exchange)));
    expect(exportRegistry(imported)).toEqual(exchange);
    expect(Object.isFrozen(exchange)).toBe(true);
    expect(Object.isFrozen(exchange.namespaces)).toBe(true);
  });

  it("rejects unsupported exchange versions through registry validation", () => {
    expect(() => importRegistry({ version: 2, namespaces: [] })).toThrow(
      expect.objectContaining({ code: "invalid_namespace_definition" }),
    );
  });

  it("resolves a canonical REF explicitly without changing parsing", async () => {
    const reference = createReferenceCandidate(registry, "order", {
      randomBytes: (size) => new Uint8Array(size),
    });
    const machineId = createMachineId();
    const lookup = vi.fn(() =>
      Promise.resolve({ machineId, namespace: "order" }),
    );
    const resolver = createReferenceResolver(registry, lookup);
    await expect(
      resolver.resolve(reference.toLowerCase().replaceAll("-", "")),
    ).resolves.toEqual({
      machineId,
      namespace: "order",
      reference,
    });
    expect(lookup).toHaveBeenCalledWith(reference, "order");
  });

  it("handles missing, mismatched, and malformed mappings", async () => {
    const reference = createReferenceCandidate(registry, "order", {
      randomBytes: (size) => new Uint8Array(size),
    });
    await expect(
      createReferenceResolver(registry, () => Promise.resolve(null)).resolve(
        reference,
      ),
    ).resolves.toBeNull();
    await expect(
      createReferenceResolver(registry, () =>
        Promise.resolve({
          machineId: createMachineId(),
          namespace: "user",
        }),
      ).resolve(reference),
    ).rejects.toMatchObject({ code: "allocation_conflict" });
    await expect(
      createReferenceResolver(registry, () => Promise.resolve(null)).resolve(
        "bad",
      ),
    ).rejects.toMatchObject({
      code: "unknown_namespace",
    });
  });
});
