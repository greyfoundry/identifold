import { validate as validateUuid, version as uuidVersion } from "uuid";

import { IdentifoldError } from "./errors.js";
import {
  createMachineId,
  parseMachineId,
  type MachineId,
  type MachineIdSource,
} from "./machine.js";
import { publicIdFromMachineId } from "./public.js";

export type LegacyIdentifierKind =
  "integer" | "nanoid" | "short-code" | "ulid" | "uuidv4";

export interface LegacyIdentifierInspection {
  readonly kind: LegacyIdentifierKind;
  readonly value: string;
}

export interface LegacyMigrationPlan {
  readonly aliasRequired: true;
  readonly legacy: LegacyIdentifierInspection;
  readonly machineId: MachineId;
  readonly namespace: string;
  readonly relationships: {
    readonly legacyToMachineId: "stored";
    readonly machineIdToPublicId: "deterministic";
  };
}

export function inspectLegacyIdentifier(
  value: string,
): LegacyIdentifierInspection {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) {
    throw invalidLegacy();
  }
  const lower = value.toLowerCase();
  if (validateUuid(lower) && uuidVersion(lower) === 4)
    return { kind: "uuidv4", value };
  if (/^(0|[1-9]\d{0,38})$/.test(value)) return { kind: "integer", value };
  if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(value))
    return { kind: "ulid", value };
  if (/^[A-Za-z0-9_-]{21}$/.test(value)) return { kind: "nanoid", value };
  if (/^[A-Za-z][A-Za-z0-9_-]{1,19}$/.test(value))
    return { kind: "short-code", value };
  throw invalidLegacy();
}

export function planLegacyMigration(
  value: string,
  namespace: string,
  machineIdSource: MachineIdSource = createMachineId,
): LegacyMigrationPlan {
  const legacy = inspectLegacyIdentifier(value);
  const machineId = parseMachineId(machineIdSource());
  publicIdFromMachineId(machineId, namespace);
  return Object.freeze({
    aliasRequired: true,
    legacy: Object.freeze(legacy),
    machineId,
    namespace,
    relationships: Object.freeze({
      legacyToMachineId: "stored" as const,
      machineIdToPublicId: "deterministic" as const,
    }),
  });
}

function invalidLegacy(): IdentifoldError {
  return new IdentifoldError(
    "invalid_kind",
    "Legacy identifier format is not recognized",
  );
}
