import { IdentifoldError } from "./errors.js";
import type {
  ReferenceReservation,
  ReferenceStore,
  SequenceAllocationRequest,
  SequenceAllocator,
} from "./service.js";
import type { ReferenceLookup } from "./resolver.js";

export const RESERVE_REFERENCE_SQL =
  "SELECT identifold_reserve_reference($1::uuid, $2::text, $3::text) AS reserved";
export const ALLOCATE_SEQUENCE_SQL =
  "SELECT identifold_allocate_sequence($1::uuid, $2::text, $3::text, $4::text, $5::smallint) AS sequence";
export const RESOLVE_REFERENCE_SQL =
  "SELECT resolved_machine_id::text AS machine_id, resolved_namespace AS namespace FROM identifold_resolve_reference($1::text, $2::text)";

export type DatabaseQuery = (
  text: string,
  values: unknown[],
) => Promise<readonly Record<string, unknown>[]>;

export function createDatabaseReferenceStore(
  query: DatabaseQuery,
): ReferenceStore {
  return Object.freeze({
    async reserve(reservation: ReferenceReservation): Promise<boolean> {
      try {
        const rows = await query(RESERVE_REFERENCE_SQL, [
          reservation.machineId,
          reservation.namespace,
          reservation.reference,
        ]);
        const reserved = rows[0]?.reserved;
        if (typeof reserved !== "boolean") {
          throw new IdentifoldError(
            "allocation_conflict",
            "Reference reservation returned an invalid result",
          );
        }
        return reserved;
      } catch (error) {
        throw mapDatabaseError(error);
      }
    },
  });
}

export function createDatabaseSequenceAllocator(
  query: DatabaseQuery,
): SequenceAllocator {
  return Object.freeze({
    async allocate(request: SequenceAllocationRequest): Promise<bigint> {
      try {
        const rows = await query(ALLOCATE_SEQUENCE_SQL, [
          request.machineId,
          request.namespace,
          request.referencePrefix,
          request.scope,
          request.width,
        ]);
        const value = rows[0]?.sequence;
        if (typeof value === "bigint") return value;
        if (typeof value === "number" && Number.isSafeInteger(value))
          return BigInt(value);
        if (typeof value === "string" && /^\d+$/.test(value))
          return BigInt(value);
        throw new IdentifoldError(
          "allocation_conflict",
          "Sequence allocation returned an invalid result",
        );
      } catch (error) {
        throw mapDatabaseError(error);
      }
    },
  });
}

export function createDatabaseReferenceLookup(
  query: DatabaseQuery,
): ReferenceLookup {
  return async (reference, namespace) => {
    try {
      const rows = await query(RESOLVE_REFERENCE_SQL, [reference, namespace]);
      if (rows.length === 0) return null;
      const machineId = rows[0]?.machine_id;
      const resolvedNamespace = rows[0]?.namespace;
      if (
        rows.length !== 1 ||
        typeof machineId !== "string" ||
        typeof resolvedNamespace !== "string"
      ) {
        throw new IdentifoldError(
          "allocation_conflict",
          "Reference lookup returned an invalid result",
        );
      }
      return Object.freeze({ machineId, namespace: resolvedNamespace });
    } catch (error) {
      throw mapDatabaseError(error);
    }
  };
}

function mapDatabaseError(error: unknown): IdentifoldError {
  if (error instanceof IdentifoldError) return error;
  if (isDatabaseError(error) && error.code === "22003") {
    return new IdentifoldError(
      "sequence_overflow",
      "Sequential reference capacity is exhausted",
    );
  }
  if (isDatabaseError(error) && error.code === "22023") {
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

function isDatabaseError(error: unknown): error is { readonly code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  );
}
