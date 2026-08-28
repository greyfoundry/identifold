import {
  v7 as createUuidV7,
  validate as validateUuid,
  version as uuidVersion,
} from "uuid";

import { IdentifoldError } from "./errors.js";

declare const machineIdBrand: unique symbol;

export type MachineId = string & { readonly [machineIdBrand]: true };

export type MachineIdSource = () => MachineId;

export function createMachineId(): MachineId {
  return createUuidV7() as MachineId;
}

export function parseMachineId(value: string): MachineId {
  const canonical = value.toLowerCase();

  if (canonical.length !== 36 || !validateUuid(canonical)) {
    throw new IdentifoldError("invalid_mid", "Invalid machine identifier");
  }

  if (uuidVersion(canonical) !== 7) {
    throw new IdentifoldError(
      "invalid_uuid_version",
      "Machine identifiers must use UUIDv7",
    );
  }

  return canonical as MachineId;
}
