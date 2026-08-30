import type { RowDataPacket } from "mysql2";
import { createPool } from "mysql2/promise";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createMachineId,
  createNamespaceRegistry,
  createReferenceCandidate,
  formatSequentialReference,
} from "../src/index.js";
import { createMySqlStorageAdapter } from "../src/mysql.js";
import type { SequenceAllocationRequest } from "../src/storage.js";

const databaseUrl = process.env.IDENTIFOLD_TEST_MYSQL_URL;
const describeMySql = databaseUrl === undefined ? describe.skip : describe;

describeMySql("MySQL storage", () => {
  const pool = createPool({
    uri: databaseUrl ?? "mysql://invalid:invalid@127.0.0.1/invalid",
    connectionLimit: 40,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  const adapter = createMySqlStorageAdapter(pool);
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

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM identifold_sequence_allocations");
    await pool.query("DELETE FROM identifold_sequences");
    await pool.query("DELETE FROM identifold_references");
  });

  it("reserves exactly one contender and preserves UUIDv7 bytes", async () => {
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
    const winner = machineIds[results.indexOf(true)];
    interface MachineIdRow extends RowDataPacket {
      readonly machine_id: string;
    }
    const [rows] = await pool.query<MachineIdRow[]>(
      "SELECT HEX(machine_id) AS machine_id FROM identifold_references",
    );
    expect(rows).toEqual([
      { machine_id: winner?.replaceAll("-", "").toUpperCase() },
    ]);
  });

  it("allocates unique sequences and replays the same MID", async () => {
    const requests: SequenceAllocationRequest[] = Array.from(
      { length: 32 },
      () => ({
        machineId: createMachineId(),
        namespace: "receipt",
        referencePrefix: "RCT",
        scope: null,
        width: 4,
      }),
    );
    const allocated = await Promise.all(
      requests.map((request) => adapter.sequenceAllocator.allocate(request)),
    );
    expect(allocated.toSorted((left, right) => Number(left - right))).toEqual(
      Array.from({ length: 32 }, (_, index) => BigInt(index + 1)),
    );
    const firstRequest = requests[0];
    expect(firstRequest).toBeDefined();
    if (firstRequest === undefined) return;
    await expect(
      adapter.sequenceAllocator.allocate(firstRequest),
    ).resolves.toBe(allocated[0]);
  });

  it("resolves random and sequential references", async () => {
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
  });

  it("rejects policy changes and rolls back overflow", async () => {
    const request = {
      machineId: createMachineId(),
      namespace: "receipt",
      referencePrefix: "RCT",
      scope: null,
      width: 4,
    } as const;
    await expect(adapter.sequenceAllocator.allocate(request)).resolves.toBe(1n);
    await expect(
      adapter.sequenceAllocator.allocate({ ...request, width: 5 }),
    ).rejects.toMatchObject({ code: "invalid_allocation_policy" });

    await pool.query("DELETE FROM identifold_sequence_allocations");
    await pool.query("DELETE FROM identifold_sequences");
    await pool.query(
      "INSERT INTO identifold_sequences VALUES ('receipt', '', 'RCT', 4, 9999)",
    );
    await expect(
      adapter.sequenceAllocator.allocate({
        ...request,
        machineId: createMachineId(),
      }),
    ).rejects.toMatchObject({ code: "sequence_overflow" });
    interface CounterRow extends RowDataPacket {
      readonly counter_value: string;
    }
    const [rows] = await pool.query<CounterRow[]>(
      "SELECT counter_value FROM identifold_sequences",
    );
    expect(rows).toEqual([{ counter_value: "9999" }]);
  });
});
