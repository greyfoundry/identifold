import { IdentifoldError } from "./errors.js";
import { parseMachineId } from "./machine.js";
import { parsePublicId } from "./public.js";
import { parseReference } from "./reference.js";
import type { NamespaceRegistry } from "./registry.js";
import type { Identity } from "./service.js";

export interface SerializedIdentity {
  readonly mid: string;
  readonly pid: string;
  readonly ref?: string;
}

export function serializeIdentity(identity: Identity): SerializedIdentity {
  return identity.ref === undefined
    ? { mid: identity.mid, pid: identity.pid }
    : { mid: identity.mid, pid: identity.pid, ref: identity.ref };
}

export function deserializeIdentity(
  value: unknown,
  registry: NamespaceRegistry,
): Identity {
  if (
    !isRecord(value) ||
    typeof value.mid !== "string" ||
    typeof value.pid !== "string"
  ) {
    throw new IdentifoldError(
      "invalid_kind",
      "Identity JSON must contain string MID and PID values",
    );
  }
  const mid = parseMachineId(value.mid);
  const parsedPid = parsePublicId(value.pid);
  if (
    registry.getByPublicPrefix(parsedPid.namespace) === undefined ||
    parsedPid.machineId !== mid
  ) {
    throw new IdentifoldError(
      "invalid_pid",
      "Public identifier does not match the identity MID",
    );
  }
  if (value.ref === undefined)
    return Object.freeze({ mid, pid: parsedPid.value });
  if (typeof value.ref !== "string") {
    throw new IdentifoldError(
      "invalid_ref",
      "Identity reference must be a string",
    );
  }
  const parsedRef = parseReference(value.ref, registry);
  if (parsedRef.namespace !== parsedPid.namespace) {
    throw new IdentifoldError(
      "invalid_ref",
      "Human reference namespace does not match the PID",
    );
  }
  return Object.freeze({ mid, pid: parsedPid.value, ref: parsedRef.value });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
