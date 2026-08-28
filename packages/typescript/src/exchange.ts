import { IdentifoldError } from "./errors.js";
import { createNamespaceRegistry } from "./registry.js";
import type { NamespaceDefinition, NamespaceRegistry } from "./registry.js";

export interface RegistryExchangeV1 {
  readonly version: 1;
  readonly namespaces: readonly NamespaceDefinition[];
}

export function exportRegistry(
  registry: NamespaceRegistry,
): RegistryExchangeV1 {
  const namespaces = registry.definitions.map(
    (definition): NamespaceDefinition => {
      const reference = definition.reference;
      if (reference === undefined)
        return Object.freeze({ publicPrefix: definition.publicPrefix });
      if (reference.strategy === "random") {
        return Object.freeze({
          publicPrefix: definition.publicPrefix,
          reference: Object.freeze({
            prefix: reference.prefix,
            profile: reference.profile,
            strategy: reference.strategy,
          }),
        });
      }
      return Object.freeze({
        publicPrefix: definition.publicPrefix,
        reference: Object.freeze({
          prefix: reference.prefix,
          scope: reference.scope,
          strategy: reference.strategy,
          width: reference.width,
        }),
      });
    },
  );
  return Object.freeze({ version: 1, namespaces: Object.freeze(namespaces) });
}

export function importRegistry(exchange: unknown): NamespaceRegistry {
  if (
    !isRecord(exchange) ||
    exchange.version !== 1 ||
    !Array.isArray(exchange.namespaces)
  ) {
    throw new IdentifoldError(
      "invalid_namespace_definition",
      "Unsupported registry exchange format",
    );
  }
  return createNamespaceRegistry(exchange.namespaces as NamespaceDefinition[]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
