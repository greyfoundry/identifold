import { IdentifoldError } from "./errors.js";
import {
  bytesToMachineId,
  machineIdToBytes,
  parseSequentialReference,
} from "./sql-storage.js";
import { createStorageAdapter } from "./storage.js";
import type { ReferenceLookup } from "./resolver.js";
import type {
  ReferenceReservation,
  ReferenceStore,
  SequenceAllocationRequest,
  SequenceAllocator,
} from "./service.js";
import type { IdentifoldStorageAdapter } from "./storage.js";

export interface MySqlQueryable {
  query(text: string, values?: unknown[]): Promise<readonly [unknown, unknown]>;
}

export function createMySqlReferenceStore(
  client: MySqlQueryable,
): ReferenceStore {
  return Object.freeze({
    async reserve(reservation: ReferenceReservation) {
      try {
        const result = await client.query(
          "CALL identifold_reserve_reference(?, ?, ?)",
          [
            machineIdToBytes(reservation.machineId),
            reservation.namespace,
            reservation.reference,
          ],
        );
        const reserved = firstRows(result)[0]?.reserved;
        if (reserved === true || reserved === 1 || reserved === "1")
          return true;
        if (reserved === false || reserved === 0 || reserved === "0")
          return false;
        throw new IdentifoldError(
          "allocation_conflict",
          "Reference reservation returned an invalid result",
        );
      } catch (error) {
        throw mapMySqlError(error);
      }
    },
  });
}

export function createMySqlSequenceAllocator(
  client: MySqlQueryable,
): SequenceAllocator {
  return Object.freeze({
    async allocate(request: SequenceAllocationRequest) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const result = await client.query(
            "CALL identifold_allocate_sequence(?, ?, ?, ?, ?)",
            [
              machineIdToBytes(request.machineId),
              request.namespace,
              request.referencePrefix,
              request.scope,
              request.width,
            ],
          );
          const sequence = firstRows(result)[0]?.sequence;
          if (
            (typeof sequence === "string" && /^\d+$/.test(sequence)) ||
            (typeof sequence === "number" && Number.isSafeInteger(sequence)) ||
            typeof sequence === "bigint"
          ) {
            return BigInt(sequence);
          }
          throw new IdentifoldError(
            "allocation_conflict",
            "Sequence allocation returned an invalid result",
          );
        } catch (error) {
          if (attempt < 4 && isTransientMySqlError(error)) {
            await new Promise((resolve) =>
              setTimeout(resolve, Math.floor(Math.random() * 2 ** attempt)),
            );
            continue;
          }
          throw mapMySqlError(error);
        }
      }
      throw new IdentifoldError(
        "allocation_conflict",
        "Database allocation could not be committed",
      );
    },
  });
}

export function createMySqlReferenceLookup(
  client: MySqlQueryable,
): ReferenceLookup {
  return async (reference, namespace) => {
    try {
      const randomResult = await client.query(
        `SELECT machine_id, namespace
         FROM identifold_references
         WHERE reference = ? AND namespace = ?`,
        [reference, namespace],
      );
      const randomRows = firstRows(randomResult);
      if (randomRows.length > 0) return mappingFromRows(randomRows);

      const parts = parseSequentialReference(reference);
      if (parts === null) return null;
      const sequenceResult = await client.query(
        `SELECT machine_id, namespace
         FROM identifold_sequence_allocations
         WHERE namespace = ? AND reference_prefix = ?
           AND scope = ? AND sequence = ?`,
        [namespace, parts.prefix, parts.scope, parts.sequence.toString()],
      );
      const sequenceRows = firstRows(sequenceResult);
      return sequenceRows.length === 0 ? null : mappingFromRows(sequenceRows);
    } catch (error) {
      throw mapMySqlError(error);
    }
  };
}

export function createMySqlStorageAdapter(
  client: MySqlQueryable,
): IdentifoldStorageAdapter {
  return createStorageAdapter({
    referenceStore: createMySqlReferenceStore(client),
    sequenceAllocator: createMySqlSequenceAllocator(client),
    lookup: createMySqlReferenceLookup(client),
  });
}

function firstRows(
  result: readonly [unknown, unknown],
): readonly Record<string, unknown>[] {
  const value = result[0];
  const rows =
    Array.isArray(value) && Array.isArray(value[0]) ? value[0] : value;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null && !Array.isArray(row),
  );
}

function mappingFromRows(rows: readonly Record<string, unknown>[]) {
  const row = rows[0];
  if (
    rows.length !== 1 ||
    row === undefined ||
    typeof row.namespace !== "string"
  ) {
    throw new IdentifoldError(
      "allocation_conflict",
      "Reference lookup returned an invalid result",
    );
  }
  return Object.freeze({
    machineId: bytesToMachineId(row.machine_id),
    namespace: row.namespace,
  });
}

function mapMySqlError(error: unknown): IdentifoldError {
  if (error instanceof IdentifoldError) return error;
  const sqlState =
    typeof error === "object" &&
    error !== null &&
    "sqlState" in error &&
    typeof error.sqlState === "string"
      ? error.sqlState
      : undefined;
  if (sqlState === "22003") {
    return new IdentifoldError(
      "sequence_overflow",
      "Sequential reference capacity is exhausted",
    );
  }
  if (sqlState === "22023") {
    return new IdentifoldError(
      "invalid_allocation_policy",
      "Sequential allocation policy is invalid",
    );
  }
  return new IdentifoldError(
    "allocation_conflict",
    "Database allocation could not be committed",
  );
}

function isTransientMySqlError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  const sqlState =
    "sqlState" in error && typeof error.sqlState === "string"
      ? error.sqlState
      : undefined;
  return (
    sqlState === "40001" ||
    code === "ER_LOCK_DEADLOCK" ||
    code === "ER_LOCK_WAIT_TIMEOUT"
  );
}
