import {
  createMachineId,
  createNamespaceRegistry,
  createReferenceCandidate,
} from "@greyfoundry/identifold";
import { createMySqlStorageAdapter } from "@greyfoundry/identifold/mysql";
import { createPool } from "mysql2/promise";

const databaseUrl = process.env.IDENTIFOLD_TEST_MYSQL_URL;
if (databaseUrl === undefined) {
  throw new Error("IDENTIFOLD_TEST_MYSQL_URL is required");
}

const pool = createPool({ uri: databaseUrl });
try {
  const adapter = createMySqlStorageAdapter(pool);
  const registry = createNamespaceRegistry([
    { publicPrefix: "order", reference: { prefix: "ORD", strategy: "random" } },
  ]);
  const reference = createReferenceCandidate(registry, "order");
  const reserved = await adapter.referenceStore.reserve({
    machineId: createMachineId(),
    namespace: "order",
    reference,
  });
  const mapping = await adapter.lookup(reference, "order");
  console.log(JSON.stringify({ reserved, mapping }));
} finally {
  await pool.end();
}
