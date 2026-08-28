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
  {
    publicPrefix: "invoice",
    reference: {
      prefix: "INV",
      scope: "calendar-year",
      strategy: "sequence",
      width: 6,
    },
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

Sequential namespaces require an allocator that atomically advances and binds each scoped sequence to the supplied MID:

```ts
const invoices = createIdentifold({
  registry,
  sequenceAllocator: {
    async allocate(request) {
      return database.allocateAndBindSequence(request);
    },
  },
});
```

Allocator values are `bigint` so widths up to 18 decimal digits remain exact. Calendar-year scopes are derived from the UTC year and can use an injected `now` function in deterministic tests.

## Dependency injection

`createIdentifold` keeps volatile and persistent operations behind explicit, typed boundaries:

- `machineIdSource` supplies a MID and is validated as UUIDv7 before use;
- `now` supplies the clock used for calendar-year sequence scopes;
- `randomBytes` supplies random REF bytes;
- `referenceStore` atomically reserves random references; and
- `sequenceAllocator` transactionally allocates and binds sequential references.

The default MID source delegates UUIDv7 generation to `uuid`. PID encoding and decoding delegate to `typeid-js` so the package does not maintain separate implementations of either standard. Injected MID and random sources are intended for deterministic tests and controlled platform integrations; production sources must retain the security guarantees described in the specification.
