# Namespace registry

A registry is an immutable collection of namespace definitions.

Conceptual definition:

```text
public prefix: order
reference prefix: ORD
reference strategy: random
reference profile: standard
```

The public prefix is the canonical namespace key. It follows TypeID v0.3 prefix rules and appears in PIDs. The reference prefix is optional and appears in REFs.

Registry construction validates the complete collection before returning it. It rejects:

- duplicate public prefixes;
- duplicate REF prefixes under case-insensitive comparison;
- REF prefixes where either prefix is the beginning of the other;
- malformed TypeID prefixes;
- REF prefixes outside 2 to 8 ASCII letters;
- random profiles with unsupported lengths;
- sequential widths outside 4 to 18;
- attempts to allocate a sequential namespace without a transactional allocator.

Definitions and the returned registry MUST be immutable from the caller's perspective.

Namespace removal does not make existing IDs invalid. Applications that retire a namespace SHOULD preserve a read-only historical registry for parsing and migration.

Aliases belong in migration adapters rather than the canonical registry. A canonical public or REF prefix MUST identify only one entity type for the lifetime of a published system.
