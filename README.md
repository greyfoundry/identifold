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

The project is specification-first. See [SPEC.md](SPEC.md) for the normative contract and [roadmap.md](roadmap.md) for delivery phases and gates.

## Status

Identifold is pre-release. Formats and APIs are not stable until the specification and conformance vectors reach their first stable version.

## Security boundary

Identifiers identify. They do not authenticate callers or authorize access. Knowledge of an identifier or reference must never grant access by itself.

## Standards

- UUIDv7 follows [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html).
- Public IDs follow [TypeID specification v0.3](https://github.com/jetify-com/typeid/tree/main/spec).
- Random reference payloads use the Crockford Base32 data alphabet and modulo-37 check-symbol convention.

## License

Apache-2.0.
