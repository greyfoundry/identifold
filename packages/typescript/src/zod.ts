import { z } from "zod";

import { IdentifoldError } from "./errors.js";
import { parseMachineId, type MachineId } from "./machine.js";
import { parsePublicId, type PublicId } from "./public.js";
import { parseReference, type HumanReference } from "./reference.js";
import type { NamespaceRegistry } from "./registry.js";

export const machineIdSchema = z
  .string()
  .transform((value, context): MachineId => {
    try {
      return parseMachineId(value);
    } catch (error) {
      addIdentifierIssue(context, error);
      return z.NEVER;
    }
  });

export function publicIdSchema<Namespace extends string>(namespace: Namespace) {
  return z.string().transform((value, context): PublicId<Namespace> => {
    try {
      const parsed = parsePublicId(value);
      if (parsed.namespace !== namespace) {
        throw new IdentifoldError(
          "invalid_pid",
          "Public identifier namespace does not match",
        );
      }
      return parsed.value as PublicId<Namespace>;
    } catch (error) {
      addIdentifierIssue(context, error);
      return z.NEVER;
    }
  });
}

export function referenceSchema(
  registry: NamespaceRegistry,
  namespace?: string,
) {
  return z.string().transform((value, context): HumanReference => {
    try {
      const parsed = parseReference(value, registry);
      if (namespace !== undefined && parsed.namespace !== namespace) {
        throw new IdentifoldError(
          "invalid_ref",
          "Human reference namespace does not match",
        );
      }
      return parsed.value;
    } catch (error) {
      addIdentifierIssue(context, error);
      return z.NEVER;
    }
  });
}

function addIdentifierIssue(context: z.RefinementCtx, error: unknown): void {
  context.addIssue({
    code: "custom",
    message:
      error instanceof IdentifoldError ? error.code : "invalid_identifier",
  });
}
