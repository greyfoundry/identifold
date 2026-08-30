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

interface SqliteRunResult {
  readonly changes: number;
}

interface SqliteStatement {
  get(...values: unknown[]): unknown;
  run(...values: unknown[]): SqliteRunResult;
}

export interface SqliteDatabase {
  exec(text: string): unknown;
  prepare(text: string): SqliteStatement;
}

export function createSqliteReferenceStore(
  database: SqliteDatabase,
): ReferenceStore {
  const statement = database.prepare(
    `INSERT INTO identifold_references (reference, namespace, machine_id)
     VALUES (?, ?, ?)
     ON CONFLICT(reference) DO NOTHING`,
  );
  return Object.freeze({
    async reserve(reservation: ReferenceReservation) {
      await Promise.resolve();
      try {
        return (
          statement.run(
            reservation.reference,
            reservation.namespace,
            machineIdToBytes(reservation.machineId),
          ).changes === 1
        );
      } catch (error) {
        throw mapSqliteError(error);
      }
    },
  });
}

export function createSqliteSequenceAllocator(
  database: SqliteDatabase,
): SequenceAllocator {
  return Object.freeze({
    async allocate(request: SequenceAllocationRequest) {
      await Promise.resolve();
      if (
        !Number.isInteger(request.width) ||
        request.width < 4 ||
        request.width > 18
      ) {
        throw new IdentifoldError(
          "invalid_allocation_policy",
          "Sequential allocation policy is invalid",
        );
      }
      const scope = request.scope ?? "";
      try {
        database.exec("BEGIN IMMEDIATE");
        const existing = recordOrNull(
          database
            .prepare(
              `SELECT CAST(sequence AS TEXT) AS sequence, reference_prefix, width
               FROM identifold_sequence_allocations
               WHERE namespace = ? AND scope = ? AND machine_id = ?`,
            )
            .get(request.namespace, scope, machineIdToBytes(request.machineId)),
        );
        if (existing !== null) {
          if (
            existing.reference_prefix !== request.referencePrefix ||
            existing.width !== request.width ||
            typeof existing.sequence !== "string"
          ) {
            throw new IdentifoldError(
              "invalid_allocation_policy",
              "Sequential allocation policy is invalid",
            );
          }
          database.exec("COMMIT");
          return BigInt(existing.sequence);
        }

        database
          .prepare(
            `INSERT INTO identifold_sequences
               (namespace, scope, reference_prefix, width, last_value)
             VALUES (?, ?, ?, ?, 0)
             ON CONFLICT DO NOTHING`,
          )
          .run(
            request.namespace,
            scope,
            request.referencePrefix,
            request.width,
          );
        const state = recordOrNull(
          database
            .prepare(
              `SELECT reference_prefix, width, CAST(last_value AS TEXT) AS last_value
               FROM identifold_sequences
               WHERE namespace = ? AND scope = ?`,
            )
            .get(request.namespace, scope),
        );
        if (state === null) {
          throw new IdentifoldError(
            "invalid_allocation_policy",
            "Sequential allocation policy is invalid",
          );
        }
        if (
          state.reference_prefix !== request.referencePrefix ||
          state.width !== request.width ||
          typeof state.last_value !== "string"
        ) {
          throw new IdentifoldError(
            "invalid_allocation_policy",
            "Sequential allocation policy is invalid",
          );
        }
        const current = BigInt(state.last_value);
        const maximum = 10n ** BigInt(request.width) - 1n;
        if (current >= maximum) {
          throw new IdentifoldError(
            "sequence_overflow",
            "Sequential reference capacity is exhausted",
          );
        }
        const allocated = current + 1n;
        database
          .prepare(
            `UPDATE identifold_sequences SET last_value = ?
             WHERE namespace = ? AND scope = ?`,
          )
          .run(allocated, request.namespace, scope);
        database
          .prepare(
            `INSERT INTO identifold_sequence_allocations
               (namespace, scope, sequence, machine_id, reference_prefix, width)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            request.namespace,
            scope,
            allocated,
            machineIdToBytes(request.machineId),
            request.referencePrefix,
            request.width,
          );
        database.exec("COMMIT");
        return allocated;
      } catch (error) {
        try {
          database.exec("ROLLBACK");
        } catch {
          // The transaction may already have completed.
        }
        throw mapSqliteError(error);
      }
    },
  });
}

export function createSqliteReferenceLookup(
  database: SqliteDatabase,
): ReferenceLookup {
  return (reference, namespace) =>
    Promise.resolve().then(() => {
      try {
        const random = recordOrNull(
          database
            .prepare(
              `SELECT machine_id, namespace FROM identifold_references
             WHERE reference = ? AND namespace = ?`,
            )
            .get(reference, namespace),
        );
        if (random !== null) return mappingFromRecord(random);

        const parts = parseSequentialReference(reference);
        if (parts === null) return null;
        const sequential = recordOrNull(
          database
            .prepare(
              `SELECT machine_id, namespace
             FROM identifold_sequence_allocations
             WHERE namespace = ? AND reference_prefix = ?
               AND scope = ? AND sequence = ?`,
            )
            .get(namespace, parts.prefix, parts.scope, parts.sequence),
        );
        return sequential === null ? null : mappingFromRecord(sequential);
      } catch (error) {
        throw mapSqliteError(error);
      }
    });
}

export function createSqliteStorageAdapter(
  database: SqliteDatabase,
): IdentifoldStorageAdapter {
  return createStorageAdapter({
    referenceStore: createSqliteReferenceStore(database),
    sequenceAllocator: createSqliteSequenceAllocator(database),
    lookup: createSqliteReferenceLookup(database),
  });
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mappingFromRecord(record: Record<string, unknown>) {
  if (typeof record.namespace !== "string") {
    throw new IdentifoldError(
      "allocation_conflict",
      "Reference lookup returned an invalid result",
    );
  }
  return Object.freeze({
    machineId: bytesToMachineId(record.machine_id),
    namespace: record.namespace,
  });
}

function mapSqliteError(error: unknown): IdentifoldError {
  if (error instanceof IdentifoldError) return error;
  return new IdentifoldError(
    "allocation_conflict",
    "Database allocation could not be committed",
  );
}
