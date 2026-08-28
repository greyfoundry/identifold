# @greyfoundry/identifold

TypeScript reference implementation of the Identifold specification.

This package is pre-release and does not yet provide a stable API.

```ts
import {
  createIdentifold,
  createNamespaceRegistry,
} from "@greyfoundry/identifold";

const registry = createNamespaceRegistry([
  { publicPrefix: "user" },
  {
    publicPrefix: "order",
    reference: { prefix: "ORD", strategy: "random" },
  },
]);

const users = createIdentifold({ registry });
const user = await users.create("user");
```

For a namespace with random human references, provide a store whose `reserve` method atomically inserts the reference-to-MID mapping and returns `false` on a unique conflict:

```ts
const orders = createIdentifold({
  registry,
  referenceStore: {
    async reserve({ machineId, namespace, reference }) {
      return database.tryInsertUniqueReference({
        machineId,
        namespace,
        reference,
      });
    },
  },
});

const order = await orders.create("order");
```

The service also exposes `parse`, `validate`, `inspect`, and `normalize`. Parsing a REF checks its format and checksum but never implies that the reference exists in storage. `inspect` reports REF resolution as `not-requested` because storage lookup is a separate application operation.

Sequential REF configuration is accepted by the draft registry but allocation and parsing are not yet implemented by this package.
