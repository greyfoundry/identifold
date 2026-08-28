import { IdentifoldError } from "./errors.js";
import { parseMachineId, type MachineId } from "./machine.js";
import { parseReference, type HumanReference } from "./reference.js";
import type { NamespaceRegistry } from "./registry.js";

export interface ReferenceLookupResult {
  readonly machineId: string;
  readonly namespace: string;
}

export type ReferenceLookup = (
  reference: HumanReference,
  namespace: string,
) => Promise<ReferenceLookupResult | null>;

export interface ResolvedReference {
  readonly machineId: MachineId;
  readonly namespace: string;
  readonly reference: HumanReference;
}

export interface ReferenceResolver {
  resolve(value: string): Promise<ResolvedReference | null>;
}

export function createReferenceResolver(
  registry: NamespaceRegistry,
  lookup: ReferenceLookup,
): ReferenceResolver {
  return Object.freeze({
    async resolve(value: string): Promise<ResolvedReference | null> {
      const parsed = parseReference(value, registry);
      const result = await lookup(parsed.value, parsed.namespace);
      if (result === null) return null;
      if (result.namespace !== parsed.namespace) {
        throw new IdentifoldError(
          "allocation_conflict",
          "Resolved reference namespace does not match",
        );
      }
      return Object.freeze({
        machineId: parseMachineId(result.machineId),
        namespace: parsed.namespace,
        reference: parsed.value,
      });
    },
  });
}
