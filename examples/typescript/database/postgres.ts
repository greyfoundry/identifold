import {
  createMachineId,
  createNamespaceRegistry,
  createReferenceCandidate,
} from "@greyfoundry/identifold";
import { createPostgresStorageAdapter } from "@greyfoundry/identifold/postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl });
try {
  const adapter = createPostgresStorageAdapter(pool);
  const machineId = createMachineId();
  const registry = createNamespaceRegistry([
    { publicPrefix: "order", reference: { prefix: "ORD", strategy: "random" } },
  ]);
  const reference = createReferenceCandidate(registry, "order");
  const reserved = await adapter.referenceStore.reserve({
    machineId,
    namespace: "order",
    reference,
  });
  const mapping = await adapter.lookup(reference, "order");
  console.log(JSON.stringify({ reserved, mapping }));
} finally {
  await pool.end();
}
