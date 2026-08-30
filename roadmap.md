# Identifold roadmap

This roadmap is the public delivery contract for Identifold. A phase is complete only when every exit gate in that phase is satisfied. Later phases may be explored early, but they do not inherit completion from prototypes.

## Current status

| Phase | Status   | Remaining gate                                 |
| ----- | -------- | ---------------------------------------------- |
| 0     | Complete | All exit gates satisfied                       |
| 1     | Complete | All exit gates satisfied                       |
| 2     | Complete | All exit gates satisfied                       |
| 3     | Complete | All exit gates satisfied                       |
| 4     | Complete | All exit gates satisfied                       |
| 5     | Complete | All exit gates satisfied                       |
| 6     | Complete | All exit gates satisfied                       |
| 7     | Complete | Python implementation satisfies all exit gates |
| 8     | Complete | All exit gates satisfied                       |
| 9     | Complete | All exit gates satisfied                       |
| 10    | Planned  | Written storage-integration design approved    |
| 11    | Planned  | MySQL and SQLite gates satisfied               |
| 12    | Planned  | MongoDB and DynamoDB gates satisfied           |
| 13    | Planned  | SQL Server and Firestore gates satisfied       |
| 14    | Planned  | Compatibility and release gates satisfied      |

## Version 1.0 multilingual release

Status: Complete. All exit gates are satisfied by the `v1.0.0` release.

The 1.0 release freezes the specification and conformance vectors, promotes the TypeScript and Python examples to tested production artifacts, and ships conforming implementations for TypeScript, Python, Java, C#, Go, PHP, Kotlin, Rust, Ruby, and Swift.

Distribution status: all ten public package targets are verified live. See [IMPLEMENTATIONS.md](IMPLEMENTATIONS.md) for registry links and runtime requirements.

Post-release hardening on `main` extends the executable production-example gate to all ten languages and maintains a complete installation, operations, and release handbook in the project wiki. These additions do not change the stable 1.0 wire contract.

Exit gate:

- every implementation passes every required language-neutral vector;
- package and build metadata report version `1.0.0`;
- the TypeScript and Python production examples execute successfully;
- protected hosted checks cover every supported runtime;
- the `v1.0.0` tag and release are created only from a clean, verified `main`.

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

## Phase 10: Storage integration foundation

Define one behavioral contract before adding database-specific implementations.

Deliverables:

- language-neutral storage contract for reservation, resolution, sequence allocation, replay, and errors;
- reusable lifecycle, concurrency, rollback, and consistency runners for all ten implementation languages;
- native PostgreSQL storage contracts and adapters for TypeScript, Python, Rust, Go, Java, Kotlin, C#, Swift, Ruby, and PHP;
- PostgreSQL migration of every language package onto the shared harness;
- idempotent same-MID sequence replay; and
- public architecture and operations documentation.

Exit gate:

- PostgreSQL passes every shared storage suite in all ten languages without regressing its current guarantees;
- concurrent reservation produces exactly one winner;
- sequential counter advancement and binding roll back together;
- same-MID replay returns the committed sequence; and
- the written design in [docs/database-integrations-design.md](docs/database-integrations-design.md) is approved.

## Phase 11: MySQL and SQLite

Add the highest-value relational and embedded storage integrations.

Deliverables:

- MySQL 8.4 InnoDB migrations, native adapters and examples for all ten languages, and an operations guide;
- SQLite migrations, native adapters and examples for all ten languages, busy handling, and WAL guidance;
- MariaDB compatibility evidence through all ten MySQL adapters; and
- protected hosted jobs for both primary backends.

Exit gate:

- MySQL and SQLite pass every shared lifecycle, concurrency, rollback, replay, and overflow suite in all ten languages;
- UUIDv7 storage preserves all 128 bits without UUIDv1 byte swapping;
- SQLite documents its single-writer and same-host WAL boundaries; and
- all twenty public language-and-backend examples execute through supported drivers.

## Phase 12: MongoDB and DynamoDB

Add document and serverless key-value integrations.

Deliverables:

- MongoDB unique indexes, native adapters and examples for all ten languages, and Atlas guidance;
- DynamoDB table design, conditional reservation, transactional native adapters and examples for all ten languages, and capacity guidance;
- replica-set and DynamoDB Local verification; and
- protected hosted jobs.

Exit gate:

- both backends pass every shared storage suite in all ten languages;
- post-commit resolution uses the documented consistent-read path;
- retry behavior is bounded and same-MID replay is durable; and
- no standalone non-idempotent counter can allocate a REF.

## Phase 13: SQL Server and Firestore

Add enterprise SQL and managed document integrations.

Deliverables:

- SQL Server migrations, locked counter-row procedures, native adapters and examples for all ten languages, and Azure SQL guidance;
- Firestore collection model, transactional native adapters and examples for all ten languages, emulator tests, and security-rule guidance; and
- protected hosted jobs for both backends.

Exit gate:

- both backends pass every shared storage suite in all ten languages;
- SQL Server sequence objects are not used where rollback cannot bind the value atomically;
- Firestore allocation cannot be performed by untrusted direct client writes; and
- operational errors remain sanitized.

## Phase 14: Compatibility certification and release

Certify compatible databases and publish the additive integration release.

Deliverables:

- MariaDB, CockroachDB, and YugabyteDB conformance reports covering all ten language adapters;
- explicit backend differences and retry guidance;
- complete root, package, integration, and wiki documentation;
- protected compatibility jobs; and
- provenance-backed or tokenless releases for all ten language packages where their registries support them.

Exit gate:

- each compatibility claim is backed by the full applicable storage suite in all ten languages;
- managed DynamoDB and Firestore pass protected live-cloud certification in addition to emulator checks;
- all seventy primary language-and-backend integrations and examples are green on the release commit;
- all new hosted checks are required on protected `main`;
- public installation is verified from all ten package registries; and
- the stable 1.0 wire contract remains unchanged.

## Stable release gate

Identifold reaches 1.0 only when Phases 0 through 9 are complete, the compatibility policy is published, production examples are tested, all ten implementations pass the language-neutral conformance suite, and protected hosted checks cover every supported runtime.

Current stable-release status: Identifold 1.0.0 was released from verified `main` on 2026-08-29.
