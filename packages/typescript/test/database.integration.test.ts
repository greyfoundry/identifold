import { existsSync, readFileSync } from "node:fs";

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createMachineId,
  createNamespaceRegistry,
  createReferenceCandidate,
  formatSequentialReference,
} from "../src/index.js";
import {
  createPostgresReferenceStore,
  createPostgresSequenceAllocator,
  createPostgresStorageAdapter,
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
    {
      publicPrefix: "receipt",
      reference: { prefix: "RCT", strategy: "sequence", width: 4 },
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
  const legacyUpUrl = new URL(
    "../../../integrations/postgres/migrations/002_legacy_aliases.up.sql",
    import.meta.url,
  );
  const legacyDownUrl = new URL(
    "../../../integrations/postgres/migrations/002_legacy_aliases.down.sql",
    import.meta.url,
  );
  const replayUpUrl = new URL(
    "../../../integrations/postgres/migrations/003_idempotent_replay.up.sql",
    import.meta.url,
  );
  const replayDownUrl = new URL(
    "../../../integrations/postgres/migrations/003_idempotent_replay.down.sql",
    import.meta.url,
  );
  const lookupUpUrl = new URL(
    "../../../integrations/postgres/migrations/004_reference_lookup.up.sql",
    import.meta.url,
  );

  afterAll(async () => {
    await pool.end();
  });

  beforeAll(async () => {
    await pool.query(readFileSync(downUrl, "utf8"));
    await pool.query(readFileSync(upUrl, "utf8"));
    await pool.query(readFileSync(replayUpUrl, "utf8"));
    await pool.query(readFileSync(lookupUpUrl, "utf8"));
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
    const replayUp = readFileSync(replayUpUrl, "utf8");
    const lookupUp = readFileSync(lookupUpUrl, "utf8");
    await pool.query(down);
    await pool.query(up);
    await pool.query(replayUp);
    await pool.query(lookupUp);

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
    await pool.query(replayUp);
    await pool.query(lookupUp);
  });

  it("upgrades existing allocations and reverses only replay behavior", async () => {
    const replayUp = readFileSync(replayUpUrl, "utf8");
    const replayDown = readFileSync(replayDownUrl, "utf8");
    await pool.query(replayDown);
    const allocator = createPostgresSequenceAllocator(pool);
    const request = {
      machineId: createMachineId(),
      namespace: "ticket",
      referencePrefix: "TKT",
      scope: "2026",
      width: 4,
    } as const;
    await expect(allocator.allocate(request)).resolves.toBe(1n);
    await expect(allocator.allocate(request)).rejects.toMatchObject({
      code: "allocation_conflict",
    });

    await pool.query(replayUp);
    await expect(allocator.allocate(request)).resolves.toBe(1n);
    const allocation = await pool.query<{
      machine_id: string;
      sequence: string;
    }>("SELECT machine_id, sequence FROM identifold_sequence_allocations");
    expect(allocation.rows).toEqual([
      { machine_id: request.machineId, sequence: "1" },
    ]);
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

  it("groups reservation, allocation, and random or sequential lookup", async () => {
    const adapter = createPostgresStorageAdapter(pool);
    const randomMachineId = createMachineId();
    await expect(
      adapter.referenceStore.reserve({
        machineId: randomMachineId,
        namespace: "ticket",
        reference,
      }),
    ).resolves.toBe(true);
    await expect(adapter.lookup(reference, "ticket")).resolves.toEqual({
      machineId: randomMachineId,
      namespace: "ticket",
    });

    const sequentialMachineId = createMachineId();
    const sequence = await adapter.sequenceAllocator.allocate({
      machineId: sequentialMachineId,
      namespace: "receipt",
      referencePrefix: "RCT",
      scope: null,
      width: 4,
    });
    const sequentialReference = formatSequentialReference(
      registry,
      "receipt",
      sequence,
    );
    await expect(
      adapter.lookup(sequentialReference, "receipt"),
    ).resolves.toEqual({
      machineId: sequentialMachineId,
      namespace: "receipt",
    });
    await expect(
      adapter.lookup("TKT-1111-1111-11-U" as typeof reference, "ticket"),
    ).resolves.toBeNull();
  });

  it("stores and reverses original legacy aliases", async () => {
    const legacyUp = readFileSync(legacyUpUrl, "utf8");
    const legacyDown = readFileSync(legacyDownUrl, "utf8");
    await pool.query(legacyDown);
    await pool.query(legacyUp);
    const machineId = createMachineId();
    await pool.query(
      "INSERT INTO identifold_legacy_aliases (namespace, legacy_kind, legacy_value, machine_id) VALUES ($1, $2, $3, $4)",
      ["customer", "integer", "1842", machineId],
    );
    const alias = await pool.query<{
      legacy_value: string;
      machine_id: string;
    }>("SELECT legacy_value, machine_id FROM identifold_legacy_aliases");
    expect(alias.rows).toEqual([
      { legacy_value: "1842", machine_id: machineId },
    ]);
    await pool.query(legacyDown);
    const removed = await pool.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.identifold_legacy_aliases')::text AS table_name",
    );
    expect(removed.rows[0]?.table_name).toBeNull();
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

  it("returns the committed sequence when the same MID is replayed", async () => {
    const allocator = createPostgresSequenceAllocator(pool);
    const machineId = createMachineId();
    const request = {
      machineId,
      namespace: "ticket",
      referencePrefix: "TKT",
      scope: "2026",
      width: 4,
    } as const;

    await expect(allocator.allocate(request)).resolves.toBe(1n);
    await expect(allocator.allocate(request)).resolves.toBe(1n);

    const state = await pool.query<{ allocations: string; last_value: string }>(
      `SELECT count(*)::text AS allocations, max(s.last_value)::text AS last_value
       FROM identifold_sequence_allocations a
       JOIN identifold_sequences s USING (namespace, scope)`,
    );
    expect(state.rows[0]).toEqual({ allocations: "1", last_value: "1" });
  });

  it("returns one committed value for concurrent replays of the same MID", async () => {
    const allocator = createPostgresSequenceAllocator(pool);
    const request = {
      machineId: createMachineId(),
      namespace: "ticket",
      referencePrefix: "TKT",
      scope: "2026",
      width: 4,
    } as const;

    const allocated = await Promise.all(
      Array.from({ length: 32 }, () => allocator.allocate(request)),
    );
    expect(allocated).toEqual(Array<bigint>(32).fill(1n));

    const state = await pool.query<{ allocations: string; last_value: string }>(
      `SELECT count(*)::text AS allocations, max(s.last_value)::text AS last_value
       FROM identifold_sequence_allocations a
       JOIN identifold_sequences s USING (namespace, scope)`,
    );
    expect(state.rows[0]).toEqual({ allocations: "1", last_value: "1" });
  });

  it.each([
    ["reference prefix", { referencePrefix: "BAD" }],
    ["width", { width: 5 }],
  ] as const)("rejects a replay that changes the %s", async (_, change) => {
    const allocator = createPostgresSequenceAllocator(pool);
    const machineId = createMachineId();
    const request = {
      machineId,
      namespace: "ticket",
      referencePrefix: "TKT",
      scope: "2026",
      width: 4,
    } as const;
    await expect(allocator.allocate(request)).resolves.toBe(1n);

    await expect(
      allocator.allocate({ ...request, ...change }),
    ).rejects.toMatchObject({ code: "invalid_allocation_policy" });

    const state = await pool.query<{ allocations: string; last_value: string }>(
      `SELECT count(*)::text AS allocations, max(s.last_value)::text AS last_value
       FROM identifold_sequence_allocations a
       JOIN identifold_sequences s USING (namespace, scope)`,
    );
    expect(state.rows[0]).toEqual({ allocations: "1", last_value: "1" });
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

  it("rolls back the counter when allocation binding fails", async () => {
    await pool.query(`
      CREATE FUNCTION identifold_test_reject_allocation() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'injected_failure';
      END;
      $$;
      CREATE TRIGGER identifold_test_reject_allocation
      BEFORE INSERT ON identifold_sequence_allocations
      FOR EACH ROW EXECUTE FUNCTION identifold_test_reject_allocation();
    `);

    try {
      await expect(
        createPostgresSequenceAllocator(pool).allocate({
          machineId: createMachineId(),
          namespace: "ticket",
          referencePrefix: "TKT",
          scope: null,
          width: 4,
        }),
      ).rejects.toMatchObject({ code: "allocation_conflict" });
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS identifold_test_reject_allocation
          ON identifold_sequence_allocations;
        DROP FUNCTION IF EXISTS identifold_test_reject_allocation();
      `);
    }

    const state = await pool.query<{
      allocations: string;
      sequences: string;
    }>(`SELECT
      (SELECT count(*)::text FROM identifold_sequence_allocations) AS allocations,
      (SELECT count(*)::text FROM identifold_sequences) AS sequences`);
    expect(state.rows[0]).toEqual({ allocations: "0", sequences: "0" });
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
