import {
  fromString as typeIdFromString,
  fromUUID as typeIdFromUuid,
  getType as getTypeIdPrefix,
  toUUID as typeIdToUuid,
} from "typeid-js";

import { IdentifoldError } from "./errors.js";
import { parseMachineId } from "./machine.js";
import type { MachineId } from "./machine.js";

declare const publicIdBrand: unique symbol;

export type PublicId<Namespace extends string = string> = string & {
  readonly [publicIdBrand]: Namespace;
};

export interface ParsedPublicId<Namespace extends string = string> {
  readonly value: PublicId<Namespace>;
  readonly namespace: Namespace;
  readonly machineId: MachineId;
}

export function publicIdFromMachineId<Namespace extends string>(
  machineId: MachineId,
  namespace: Namespace,
): PublicId<Namespace> {
  const canonicalMachineId = parseMachineId(machineId);

  try {
    return String(
      typeIdFromUuid(canonicalMachineId, namespace),
    ) as PublicId<Namespace>;
  } catch {
    throw new IdentifoldError(
      "invalid_public_prefix",
      "Invalid public identifier prefix",
    );
  }
}

export function parsePublicId<Namespace extends string = string>(
  value: string,
  expectedNamespace?: Namespace,
): ParsedPublicId<Namespace> {
  if (value !== value.toLowerCase()) {
    throw new IdentifoldError("invalid_pid", "Invalid public identifier");
  }

  let parsed: ReturnType<typeof typeIdFromString>;

  try {
    parsed = typeIdFromString(value);
  } catch {
    throw new IdentifoldError("invalid_pid", "Invalid public identifier");
  }

  const namespace = getTypeIdPrefix(parsed);
  if (expectedNamespace !== undefined && namespace !== expectedNamespace) {
    throw new IdentifoldError(
      "invalid_public_prefix",
      "Public identifier prefix does not match the expected namespace",
    );
  }

  const machineId = parseMachineId(typeIdToUuid(parsed));

  return {
    value: value as PublicId<Namespace>,
    namespace: namespace as Namespace,
    machineId,
  };
}
