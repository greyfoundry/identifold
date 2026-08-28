import type { NamespaceRegistry } from "./registry.js";

export function createOpenApiComponents(registry: NamespaceRegistry) {
  const namespaces = registry.definitions
    .map(({ publicPrefix }) => publicPrefix)
    .toSorted();
  const referencePrefixes = registry.definitions
    .flatMap(({ reference }) =>
      reference === undefined ? [] : [reference.prefix],
    )
    .toSorted();
  return Object.freeze({
    schemas: Object.freeze({
      MachineId: Object.freeze({
        type: "string" as const,
        format: "uuid",
        pattern:
          "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        example: "01890a5d-ac96-774b-bf20-69de2b531a31",
      }),
      PublicId: Object.freeze({
        type: "string" as const,
        format: "identifold-pid-v1",
        "x-identifold-namespaces": Object.freeze(namespaces),
      }),
      HumanReference: Object.freeze({
        type: "string" as const,
        format: "identifold-ref-v1",
        "x-identifold-reference-prefixes": Object.freeze(referencePrefixes),
      }),
    }),
  });
}
