# Identifold

One identity. Three representations.

Identifold defines a portable identity model for applications that need:

- a UUIDv7 machine identifier for storage;
- a TypeID-compatible public identifier for APIs and logs; and
- a short, checksummed reference for people.

```text
MID  019d4c72-c910-7a84-b313-53c3ac61a32f
PID  order_01kn675j8gfa2b64tkrep638sf
REF  ORD-7K4M-2P8Q-3D-9
```

The MID and PID are deterministic representations of the same UUIDv7. A REF is independently allocated and resolves to the MID through application storage.

```text
MID <-> PID
REF -> storage -> MID
```

The project is specification-first. See [SPEC.md](SPEC.md) for the stable 1.0 normative contract and [roadmap.md](roadmap.md) for delivery phases and gates.

## TypeScript quick start

The stable TypeScript reference package is developed in `packages/typescript`. Release artifacts and registry publication status are listed in [IMPLEMENTATIONS.md](IMPLEMENTATIONS.md).

```ts
import {
  createIdentifold,
  createNamespaceRegistry,
} from "@greyfoundry/identifold";

const registry = createNamespaceRegistry([{ publicPrefix: "user" }]);
const ids = createIdentifold({ registry });

const identity = await ids.create("user");

ids.parse(identity.pid);
ids.validate(identity.mid);
ids.inspect(identity.pid);
ids.normalize(identity.mid.toUpperCase());
```

Namespaces with a human-reference configuration require an atomic `ReferenceStore` before `create` returns a REF. Candidate generation alone does not establish uniqueness.

Tested production examples are available for [TypeScript and Python](examples/README.md).

Sequential namespaces use a transactional `SequenceAllocator`. Its `allocate` operation must advance the namespace-and-scope counter and bind the allocated value to the supplied MID in the same transaction. Calendar-year scopes use the UTC year.

The TypeScript implementation exposes typed injection points for MID creation, clocks, REF randomness, atomic random-reference reservation, and sequential allocation. Injected MID values are validated before any storage operation. Default UUIDv7 generation remains delegated to `uuid`, while PID encoding remains delegated to `typeid-js`.

## Storage responsibilities

- Store the MID as the canonical identity, preferably in a native UUID or 16-byte database type.
- Derive the PID from the MID and registered public prefix unless an application has a specific indexing need.
- Store each REF as a separate unique value mapped to its MID and namespace.
- Implement `ReferenceStore.reserve` as one atomic insert-or-conflict operation backed by a unique constraint.
- Preserve retired namespace definitions for historical parsing.

An in-memory uniqueness check is not a production allocation boundary for multiple processes.

## Status

Identifold 1.0 has a frozen wire contract, vector schema, and error taxonomy, with conforming implementations for ten languages. Production uniqueness depends on the configured transactional storage boundary.

## Security boundary

Identifiers identify. They do not authenticate callers or authorize access. Knowledge of an identifier or reference must never grant access by itself.

## Standards

- UUIDv7 follows [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html).
- Public IDs follow [TypeID specification v0.3](https://github.com/jetify-com/typeid/tree/main/spec).
- Random reference payloads use the Crockford Base32 data alphabet and modulo-37 check-symbol convention.

## License

Apache-2.0.
