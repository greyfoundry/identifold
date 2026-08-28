import { sql, type SQL } from "drizzle-orm";

import {
  ALLOCATE_SEQUENCE_SQL,
  createDatabaseReferenceStore,
  createDatabaseSequenceAllocator,
  RESERVE_REFERENCE_SQL,
} from "./database.js";
import type { ReferenceStore, SequenceAllocator } from "./service.js";

export interface DrizzleQueryable {
  execute(query: SQL): Promise<unknown>;
}

async function execute(
  client: DrizzleQueryable,
  text: string,
  values: unknown[],
) {
  const query =
    text === RESERVE_REFERENCE_SQL
      ? sql`SELECT identifold_reserve_reference(${values[0]}::uuid, ${values[1]}::text, ${values[2]}::text) AS reserved`
      : text === ALLOCATE_SEQUENCE_SQL
        ? sql`SELECT identifold_allocate_sequence(${values[0]}::uuid, ${values[1]}::text, ${values[2]}::text, ${values[3]}::text, ${values[4]}::smallint) AS sequence`
        : sql.raw(text);
  const result = await client.execute(query);
  if (Array.isArray(result))
    return result as readonly Record<string, unknown>[];
  if (
    typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as readonly Record<string, unknown>[];
  }
  return [];
}

export function createDrizzleReferenceStore(
  client: DrizzleQueryable,
): ReferenceStore {
  return createDatabaseReferenceStore((text, values) =>
    execute(client, text, values),
  );
}

export function createDrizzleSequenceAllocator(
  client: DrizzleQueryable,
): SequenceAllocator {
  return createDatabaseSequenceAllocator((text, values) =>
    execute(client, text, values),
  );
}
