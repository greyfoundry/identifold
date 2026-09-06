import { readFileSync } from "node:fs";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createMachineId,
  createNamespaceRegistry,
  createReferenceCandidate,
  formatSequentialReference,
} from "../src/index.js";
import { createSqliteStorageAdapter } from "../src/sqlite.js";

const up = readFileSync(
  new URL(
    "../../../integrations/sqlite/migrations/001_identifold.up.sql",
    import.meta.url,
  ),
  "utf8",
);
const down = readFileSync(
  new URL(
    "../../../integrations/sqlite/migrations/001_identifold.down.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("SQLite storage", () => {
  let database: Database.Database;
  const registry = createNamespaceRegistry([
    {
      publicPrefix: "order",
      reference: { prefix: "ORD", strategy: "random" },
    },
    {
      publicPrefix: "receipt",
      reference: { prefix: "RCT", strategy: "sequence", width: 4 },
    },
  ]);
  const reference = createReferenceCandidate(registry, "order", {
    randomBytes: (size) => new Uint8Array(size),
  });

  beforeEach(() => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    database.exec(up);
  });

  afterEach(() => {
    database.close();
  });

  it("applies and reverses the schema", () => {
    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE 'identifold_%'",
        )
        .get(),
    ).toEqual({ count: 3 });
    database.exec(down);
    expect(
      database
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE 'identifold_%'",
        )
        .get(),
    ).toEqual({ count: 0 });
  });

  it("reserves one contender and preserves UUIDv7 bytes", async () => {
    const adapter = createSqliteStorageAdapter(database);
    const machineIds = Array.from({ length: 20 }, () => createMachineId());
    const results = await Promise.all(
      machineIds.map((machineId) =>
        adapter.referenceStore.reserve({
          machineId,
          namespace: "order",
          reference,
        }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(
      database
        .prepare(
          "SELECT hex(machine_id) AS machine_id FROM identifold_references",
        )
        .get(),
    ).toEqual({
      machine_id: machineIds[results.indexOf(true)]
        ?.replaceAll("-", "")
        .toUpperCase(),
    });
  });

  it("allocates, replays, and resolves both strategies", async () => {
    const adapter = createSqliteStorageAdapter(database);
    const randomMachineId = createMachineId();
    await adapter.referenceStore.reserve({
      machineId: randomMachineId,
      namespace: "order",
      reference,
    });
    await expect(adapter.lookup(reference, "order")).resolves.toEqual({
      machineId: randomMachineId,
      namespace: "order",
    });

    const request = {
      machineId: createMachineId(),
      namespace: "receipt",
      referencePrefix: "RCT",
      scope: null,
      width: 4,
    } as const;
    await expect(adapter.sequenceAllocator.allocate(request)).resolves.toBe(1n);
    await expect(adapter.sequenceAllocator.allocate(request)).resolves.toBe(1n);
    const sequentialReference = formatSequentialReference(
      registry,
      "receipt",
      1n,
    );
    await expect(
      adapter.lookup(sequentialReference, "receipt"),
    ).resolves.toEqual({
      machineId: request.machineId,
      namespace: "receipt",
    });
  });

  it("allocates ordered values and rolls back a failed binding", async () => {
    const adapter = createSqliteStorageAdapter(database);
    const allocated = await Promise.all(
      Array.from({ length: 32 }, () =>
        adapter.sequenceAllocator.allocate({
          machineId: createMachineId(),
          namespace: "receipt",
          referencePrefix: "RCT",
          scope: null,
          width: 4,
        }),
      ),
    );
    expect(allocated).toEqual(
      Array.from({ length: 32 }, (_, index) => BigInt(index + 1)),
    );

    database.exec(down);
    database.exec(up);
    database.exec(`
      CREATE TRIGGER identifold_test_reject_allocation
      BEFORE INSERT ON identifold_sequence_allocations
      BEGIN
        SELECT RAISE(ABORT, 'injected_failure');
      END;
    `);
    await expect(
      adapter.sequenceAllocator.allocate({
        machineId: createMachineId(),
        namespace: "receipt",
        referencePrefix: "RCT",
        scope: null,
        width: 4,
      }),
    ).rejects.toMatchObject({ code: "allocation_conflict" });
    expect(
      database
        .prepare("SELECT count(*) AS count FROM identifold_sequences")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("rolls back sequence overflow without changing the counter", async () => {
    const adapter = createSqliteStorageAdapter(database);
    database
      .prepare(
        "INSERT INTO identifold_sequences VALUES ('receipt', '', 'RCT', 4, 9999)",
      )
      .run();
    await expect(
      adapter.sequenceAllocator.allocate({
        machineId: createMachineId(),
        namespace: "receipt",
        referencePrefix: "RCT",
        scope: null,
        width: 4,
      }),
    ).rejects.toMatchObject({ code: "sequence_overflow" });
    expect(
      database
        .prepare(
          "SELECT last_value AS value FROM identifold_sequences WHERE namespace = 'receipt'",
        )
        .get(),
    ).toEqual({ value: 9999 });
  });
});
