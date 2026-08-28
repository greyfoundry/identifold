import {
  createDatabaseReferenceStore,
  createDatabaseSequenceAllocator,
} from "./database.js";
import type { ReferenceStore, SequenceAllocator } from "./service.js";

export interface PostgresQueryable {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ readonly rows: readonly Record<string, unknown>[] }>;
}

export function createPostgresReferenceStore(
  client: PostgresQueryable,
): ReferenceStore {
  return createDatabaseReferenceStore(
    async (text, values) => (await client.query(text, values)).rows,
  );
}

export function createPostgresSequenceAllocator(
  client: PostgresQueryable,
): SequenceAllocator {
  return createDatabaseSequenceAllocator(
    async (text, values) => (await client.query(text, values)).rows,
  );
}
