import { existsSync, readFileSync } from "node:fs";

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createMachineId,
  createNamespaceRegistry,
  createReferenceCandidate,
} from "../src/index.js";
import {
  createPostgresReferenceStore,
  createPostgresSequenceAllocator,
} from "../src/postgres.js";
import {
  createPrismaReferenceStore,
  createPrismaSequenceAllocator,
} from "../src/prisma.js";
import {
  createDrizzleReferenceStore,
  createDrizzleSequenceAllocator,
} from "../src/drizzle.js";

const databaseUrl = process.env.IDENTIFOLD_TEST_DATABASE_URL;
const describeDatabase = databaseUrl === undefined ? describe.skip : describe;

describeDatabase("PostgreSQL integration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const registry = createNamespaceRegistry([
    {
      publicPrefix: "ticket",
      reference: { prefix: "TKT", strategy: "random" },
    },
  ]);
  const reference = createReferenceCandidate(registry, "ticket", {
    randomBytes: (size) => new Uint8Array(size),
  });
  const upUrl = new URL(
    "../../../integrations/postgres/migrations/001_identifold.up.sql",
    import.meta.url,
  );
  const downUrl = new URL(
    "../../../integrations/postgres/migrations/001_identifold.down.sql",
    import.meta.url,
  );

  afterAll(async () => {
    await pool.end();
  });

  beforeAll(async () => {
    await pool.query(readFileSync(downUrl, "utf8"));
    await pool.query(readFileSync(upUrl, "utf8"));
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE identifold_sequence_allocations, identifold_sequences, identifold_references",
    );
  });

  it("applies and reverses the complete storage schema", async () => {
    expect(existsSync(upUrl)).toBe(true);
    expect(existsSync(downUrl)).toBe(true);
    if (!existsSync(upUrl) || !existsSync(downUrl)) {
      return;
    }

    const up = readFileSync(upUrl, "utf8");
    const down = readFileSync(downUrl, "utf8");
    await pool.query(down);
    await pool.query(up);

    const created = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name LIKE 'identifold_%'
       ORDER BY table_name`,
    );
    expect(created.rows.map((row) => row.table_name)).toEqual([
      "identifold_references",
      "identifold_sequence_allocations",
      "identifold_sequences",
    ]);

    await pool.query(down);
    const removed = await pool.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.identifold_references')::text AS table_name",
    );
    expect(removed.rows[0]?.table_name).toBeNull();
    await pool.query(up);
  });

  it("allows exactly one concurrent reservation for a reference", async () => {
    const store = createPostgresReferenceStore(pool);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        store.reserve({
          machineId: createMachineId(),
          namespace: "ticket",
          reference,
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    const count = await pool.query<{ count: string }>(
      "SELECT count(*) FROM identifold_references",
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("allocates unique, ordered sequences under concurrent writers", async () => {
    const allocator = createPostgresSequenceAllocator(pool);
    const allocated = await Promise.all(
      Array.from({ length: 50 }, () =>
        allocator.allocate({
          machineId: createMachineId(),
          namespace: "ticket",
          referencePrefix: "TKT",
          scope: "2026",
          width: 4,
        }),
      ),
    );

    expect(allocated.toSorted((left, right) => Number(left - right))).toEqual(
      Array.from({ length: 50 }, (_, index) => BigInt(index + 1)),
    );
  });

  it("rolls back sequence overflow", async () => {
    await pool.query(
      "INSERT INTO identifold_sequences VALUES ('ticket', '', 'TKT', 4, 9999)",
    );
    const allocator = createPostgresSequenceAllocator(pool);

    await expect(
      allocator.allocate({
        machineId: createMachineId(),
        namespace: "ticket",
        referencePrefix: "TKT",
        scope: null,
        width: 4,
      }),
    ).rejects.toMatchObject({ code: "sequence_overflow" });
    const state = await pool.query<{ last_value: string }>(
      "SELECT last_value FROM identifold_sequences WHERE namespace = 'ticket' AND scope = ''",
    );
    expect(state.rows[0]?.last_value).toBe("9999");
  });

  it("supports Prisma-compatible clients through the shared functions", async () => {
    const client = {
      $queryRawUnsafe: async <T>(
        text: string,
        ...values: unknown[]
      ): Promise<T> => (await pool.query(text, values)).rows as T,
    };
    const reserved = await createPrismaReferenceStore(client).reserve({
      machineId: createMachineId(),
      namespace: "ticket",
      reference,
    });
    const sequence = await createPrismaSequenceAllocator(client).allocate({
      machineId: createMachineId(),
      namespace: "ticket",
      referencePrefix: "TKT",
      scope: null,
      width: 4,
    });
    expect(reserved).toBe(true);
    expect(sequence).toBe(1n);
  });

  it("supports Drizzle through the shared functions", async () => {
    const database = drizzle(pool);
    const reserved = await createDrizzleReferenceStore(database).reserve({
      machineId: createMachineId(),
      namespace: "ticket",
      reference,
    });
    const sequence = await createDrizzleSequenceAllocator(database).allocate({
      machineId: createMachineId(),
      namespace: "ticket",
      referencePrefix: "TKT",
      scope: "2026",
      width: 4,
    });
    expect(reserved).toBe(true);
    expect(sequence).toBe(1n);
  });
});
