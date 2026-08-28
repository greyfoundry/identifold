import {
  createDatabaseReferenceStore,
  createDatabaseSequenceAllocator,
} from "./database.js";
import type { ReferenceStore, SequenceAllocator } from "./service.js";

export interface PrismaQueryable {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

async function query(client: PrismaQueryable, text: string, values: unknown[]) {
  return client.$queryRawUnsafe<readonly Record<string, unknown>[]>(
    text,
    ...values,
  );
}

export function createPrismaReferenceStore(
  client: PrismaQueryable,
): ReferenceStore {
  return createDatabaseReferenceStore((text, values) =>
    query(client, text, values),
  );
}

export function createPrismaSequenceAllocator(
  client: PrismaQueryable,
): SequenceAllocator {
  return createDatabaseSequenceAllocator((text, values) =>
    query(client, text, values),
  );
}
