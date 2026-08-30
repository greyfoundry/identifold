import {
  createDatabaseReferenceLookup,
  createDatabaseReferenceStore,
  createDatabaseSequenceAllocator,
} from "./database.js";
import { createStorageAdapter } from "./storage.js";
import type { ReferenceLookup } from "./resolver.js";
import type { ReferenceStore, SequenceAllocator } from "./service.js";
import type { IdentifoldStorageAdapter } from "./storage.js";

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

export function createPostgresReferenceLookup(
  client: PostgresQueryable,
): ReferenceLookup {
  return createDatabaseReferenceLookup(
    async (text, values) => (await client.query(text, values)).rows,
  );
}

export function createPostgresStorageAdapter(
  client: PostgresQueryable,
): IdentifoldStorageAdapter {
  return createStorageAdapter({
    referenceStore: createPostgresReferenceStore(client),
    sequenceAllocator: createPostgresSequenceAllocator(client),
    lookup: createPostgresReferenceLookup(client),
  });
}
