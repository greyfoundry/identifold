import { readFileSync } from "node:fs";

import {
  createMachineId,
  createNamespaceRegistry,
  createReferenceCandidate,
} from "@greyfoundry/identifold";
import { createSqliteStorageAdapter } from "@greyfoundry/identifold/sqlite";
import Database from "better-sqlite3";

const database = new Database(":memory:");
try {
  database.pragma("foreign_keys = ON");
  database.exec(
    readFileSync(
      new URL(
        "../../../../integrations/sqlite/migrations/001_identifold.up.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const adapter = createSqliteStorageAdapter(database);
  const registry = createNamespaceRegistry([
    { publicPrefix: "order", reference: { prefix: "ORD", strategy: "random" } },
  ]);
  const reference = createReferenceCandidate(registry, "order");
  const request = {
    machineId: createMachineId(),
    namespace: "order",
    reference,
  } as const;
  const reserved = await adapter.referenceStore.reserve(request);
  const mapping = await adapter.lookup(reference, request.namespace);
  console.log(JSON.stringify({ reserved, mapping }));
} finally {
  database.close();
}
