import { IdentifoldError } from "./errors.js";
import type { MachineId } from "./machine.js";

export interface SequentialReferenceParts {
  readonly prefix: string;
  readonly scope: string;
  readonly sequence: bigint;
}

export function machineIdToBytes(machineId: string): Uint8Array {
  const hex = machineId.replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new IdentifoldError("invalid_mid", "Machine identifier is invalid");
  }
  return Uint8Array.from(
    Array.from({ length: 16 }, (_, index) =>
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    ),
  );
}

export function bytesToMachineId(value: unknown): MachineId {
  if (!(value instanceof Uint8Array) || value.byteLength !== 16) {
    throw new IdentifoldError(
      "allocation_conflict",
      "Stored machine identifier is invalid",
    );
  }
  const hex = Array.from(value, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as MachineId;
}

export function parseSequentialReference(
  reference: string,
): SequentialReferenceParts | null {
  const match = /^([A-Z]{2,8})-(?:(\d{4})-)?(\d{4,18})-[0-9A-Z*~$=U]$/.exec(
    reference,
  );
  if (match === null) return null;
  return Object.freeze({
    prefix: match[1] ?? "",
    scope: match[2] ?? "",
    sequence: BigInt(match[3] ?? ""),
  });
}
