# Identifold roadmap

This roadmap is the public delivery contract for Identifold. A phase is complete only when every exit gate in that phase is satisfied. Later phases may be explored early, but they do not inherit completion from prototypes.

## Current status

| Phase | Status   | Remaining gate                                   |
| ----- | -------- | ------------------------------------------------ |
| 0     | Complete | All exit gates satisfied                         |
| 1     | Complete | All exit gates satisfied                         |
| 2     | Complete | All exit gates satisfied                         |
| 3     | Complete | All exit gates satisfied                         |
| 4     | Complete | All exit gates satisfied                         |
| 5-9   | Planned  | Phase-specific deliverables and exit gates below |

## Phase 0: Identity specification

Define the stable concepts and the boundaries between them.

Deliverables:

- MID, PID, and REF terminology;
- canonical and accepted input formats;
- namespace registry rules;
- random and sequential reference strategies;
- allocation, collision, and persistence boundaries;
- security model and error taxonomy;
- specification versioning policy.

Exit gate:

- every normative rule is testable;
- no operation claims uniqueness without naming the responsible allocator or storage boundary;
- examples agree with the normative algorithms;
- unresolved design questions are either decided or explicitly excluded from the first stable specification.

## Phase 1: Reference algorithms

Specify and implement the human-reference layer.

Deliverables:

- cryptographically secure random payload generation;
- compact, standard, and high-entropy profiles;
- Crockford Base32 normalization;
- modulo-37 check-symbol calculation;
- canonical grouping and formatting;
- collision retry through an atomic reservation interface;
- sequential allocation through a transactional allocator interface.

Exit gate:

- deterministic tests cover every alphabet symbol and check-symbol value;
- property tests cover normalization and corruption detection;
- collision tests prove bounded retry and exhaustion behavior;
- sequential tests prove allocator ownership and fixed-width overflow handling.

## Phase 2: TypeScript reference implementation

Build the first complete implementation and use it to validate the specification.

Deliverables:

- MID creation, parsing, and validation;
- exact TypeID v0.3 PID encoding and decoding;
- immutable namespace registry;
- REF generation, parsing, validation, and normalization;
- unified `create`, `parse`, `validate`, `inspect`, and `normalize` APIs;
- typed errors and dependency-injection points for clocks, randomness, reservation, and sequences;
- ESM package and generated type declarations.

Exit gate:

- unit, property, and integration tests pass on every supported Node.js release;
- package exports pass publication and type-resolution checks;
- the implementation passes all language-neutral conformance vectors;
- no runtime dependency reimplements UUIDv7 or TypeID without a documented reason.

## Phase 3: Conformance suite

Make cross-language behavior reproducible.

Deliverables:

- valid MID, PID, and REF vectors;
- normalization vectors;
- invalid-input corpus with stable error codes;
- round-trip and ordering vectors;
- vector schema and compatibility policy;
- reusable conformance runner contract.

Exit gate:

- vectors are deterministic and reviewable;
- a clean implementation can determine pass or fail without reading TypeScript source;
- at least one independent runner validates the reference implementation.

## Phase 4: Database integrations

Provide safe storage and allocation patterns.

Deliverables:

- PostgreSQL schema and atomic REF reservation;
- Prisma and Drizzle adapters;
- sequential allocator with transaction and scope rules;
- migration and backfill examples;
- index and collation guidance.

Exit gate:

- concurrent integration tests demonstrate collision safety;
- sequential allocation cannot duplicate values under concurrent writers;
- migrations are reversible where the database supports it;
- examples preserve UUID storage as the source of truth.

## Phase 5: Developer integrations

Make the identity boundary easy to carry through application contracts.

Deliverables:

- Zod schemas;
- OpenAPI formats and examples;
- JSON serialization helpers;
- framework-neutral middleware patterns;
- observability and structured-logging guidance.

Exit gate:

- generated or inferred types preserve namespace information;
- invalid external input fails with stable, non-sensitive errors;
- integrations do not add authentication or authorization semantics to identifiers.

## Phase 6: Command-line interface

Ship inspection and conformance tools.

Deliverables:

- `identifold new`;
- `identifold inspect`;
- `identifold validate`;
- `identifold normalize`;
- `identifold conformance`;
- machine-readable JSON output and stable exit codes.

Exit gate:

- commands behave consistently across supported operating systems;
- JSON output is covered by compatibility tests;
- malformed input never exposes secrets or stack traces by default.

## Phase 7: Additional languages

Implement only languages with a concrete consumer.

Initial candidates:

- Rust;
- Go;
- Python;
- Kotlin.

Exit gate for each language:

- the implementation passes the complete conformance suite;
- public APIs follow that language's conventions without changing wire formats;
- release automation and security reporting are documented.

## Phase 8: Legacy migration

Support deliberate migrations without pretending incompatible identifiers are reversible.

Deliverables:

- UUIDv4, integer, ULID, NanoID, and short-code inspection;
- alias-table patterns;
- dual-read and staged-write migration recipes;
- audit and rollback guidance.

Exit gate:

- every migration states which relationships are deterministic and which require storage;
- original identifiers can be retained as aliases when required;
- examples avoid silent identifier replacement.

## Phase 9: Advanced extensions

Add extension points only after real use demonstrates a need.

Candidates:

- organization-specific registries;
- custom reference strategies;
- custom alphabets and grouping;
- additional checksum profiles;
- resolvers and serializers;
- registry exchange formats.

Exit gate:

- extensions cannot weaken the default security and validation rules silently;
- wire-format changes are versioned;
- the core remains usable without advanced configuration.

## Stable release gate

Identifold reaches 1.0 only when Phases 0 through 3 are complete, the TypeScript package has been used in a real application, the compatibility policy is published, and an independent implementation can pass the conformance suite.
