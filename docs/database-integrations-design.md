# Database integrations design

- Status: approved, including native integrations for all ten language packages
- Date: 2026-08-30
- Target: additive Identifold 1.1 integration release across all published packages

## 1. Purpose

Identifold 1.0 defines storage as the authority for human-reference uniqueness and resolution, but its first-party implementation currently proves that boundary only with PostgreSQL. This program extends the same guarantees to:

1. MySQL 8.4 and MariaDB compatibility;
2. SQLite;
3. MongoDB;
4. Amazon DynamoDB;
5. SQL Server; and
6. Google Cloud Firestore.

CockroachDB and YugabyteDB receive explicit PostgreSQL-compatibility certification after the primary integrations. Redis, Cassandra/ScyllaDB, Elasticsearch, and OpenSearch remain outside the allocation-store support set because their normal consistency or durability models do not provide a good default fit for Identifold's uniqueness contract.

The stable MID, PID, REF wire formats and error taxonomy do not change. The work is an additive storage-integration release.

## 2. Scope boundary

The program provides:

- one backend-neutral storage-conformance contract expressed as public cases and executable adapters for every supported language;
- native migrations, indexes, procedures, or collection definitions where the backend supports them;
- first-party PostgreSQL, MySQL, SQLite, MongoDB, DynamoDB, SQL Server, and Firestore adapters for TypeScript, Python, Rust, Go, Java, Kotlin, C#, Swift, Ruby, and PHP;
- executable database examples in all ten languages and operational documentation;
- local, emulator, or containerized integration tests for every language-and-backend pair; and
- protected hosted checks for every supported backend.

All seventy primary adapter combinations are production deliverables: seven storage backends, including PostgreSQL, across ten implementation languages. A backend is not listed as supported for a language until that native adapter passes the shared behavioral contract. The shared contract prevents language-specific drivers from weakening Identifold's allocation guarantees.

It also does not:

- store PIDs as canonical keys;
- treat REFs as credentials;
- provide an ORM or general repository abstraction;
- hide backend consistency limitations;
- promise compatibility for an untested database fork; or
- require applications to store their entity payloads in the integration database.

## 3. Approaches considered

### 3.1 Contract-first subpath integrations: selected

Add a shared conformance harness, native backend artifacts, and idiomatic driver-backed integration modules in each language package. TypeScript uses subpath exports such as `@greyfoundry/identifold/mysql`; other ecosystems use their established module, namespace, feature, extra, or package conventions.

Advantages:

- preserves each language package's current public identity and the TypeScript PostgreSQL subpath model;
- keeps one release and compatibility policy;
- permits independent backend implementation waves;
- gives every integration the same observable contract; and
- isolates database drivers through optional dependencies, feature flags, extras, or integration-specific modules where the ecosystem supports that model.

Trade-off: ecosystems that cannot express optional transitive dependencies may require integration-specific companion artifacts or explicitly selected build features.

### 3.2 One npm package per database

Publish packages such as `@greyfoundry/identifold-mysql` and `@greyfoundry/identifold-dynamodb`.

Advantages: strict dependency isolation and independent release cadence.

Trade-offs: seven publishing pipelines, additional trusted-publisher setup, version coordination, more package discovery overhead, and an inconsistent transition from the existing PostgreSQL subpaths.

### 3.3 Documentation-only recipes

Publish schemas and pseudocode without supported adapters or hosted conformance.

Advantages: smallest maintenance burden.

Trade-off: does not prove the atomicity and conflict behavior that Identifold's allocation claims depend on.

The contract-first subpath model is selected because correctness evidence matters more than maximizing the number of nominally supported databases.

## 4. Architecture

```text
Identifold service
  ├─ ReferenceStore.reserve()
  ├─ SequenceAllocator.allocate()
  └─ ReferenceLookup()
             │
             ▼
   backend integration factory
             │
             ├─ MySQL / SQLite / SQL Server
             ├─ MongoDB
             ├─ DynamoDB
             └─ Firestore
             ▲
             │
   shared storage-conformance harness
```

Each integration factory returns the same three service boundaries rather than introducing a general database abstraction. The following TypeScript shape is the normative structural example; every other language exposes the idiomatic equivalent:

```ts
interface IdentifoldStorageAdapter {
  readonly referenceStore: ReferenceStore;
  readonly sequenceAllocator: SequenceAllocator;
  readonly lookup: ReferenceLookup;
}
```

The factory may expose backend-specific setup or health functions, but the allocation and resolution operations remain identical.

### 4.1 Logical records

Every backend represents three logical record types:

**Reference mapping**

- canonical REF;
- namespace;
- MID;
- creation timestamp.

The canonical REF is globally unique within one integration store, matching the existing PostgreSQL contract and the registry requirement that REF prefixes are globally unambiguous. Namespace remains stored and checked, but it does not weaken REF uniqueness into a compound-only constraint. Multi-tenant partitioning is outside this release.

**Sequence state**

- namespace and scope key;
- REF prefix and fixed width;
- last committed value.

**Sequence allocation**

- namespace and scope;
- allocated sequence;
- MID;
- REF prefix and width;
- allocation timestamp.

The physical schema may differ, but it must preserve the same uniqueness and transaction invariants.

### 4.2 MID representation

- PostgreSQL continues to use native `uuid`.
- MySQL uses raw UUIDv7 bytes in `BINARY(16)` without UUIDv1 time-part swapping.
- SQLite uses a 16-byte `BLOB` with length checks.
- MongoDB uses BSON UUID subtype 4.
- SQL Server uses a representation that preserves all UUID bits; `BINARY(16)` is preferred where UUIDv7 byte ordering is required.
- DynamoDB and Firestore use canonical lowercase UUID strings for cross-SDK portability.

PIDs are derived at application boundaries and are not persisted by these integrations.

### 4.3 Client and schema ownership

Adapters receive an already configured pool, client, database, or collection root. They open and complete the transactions required by one allocation call but never close a caller-owned client. They do not run migrations automatically.

SQL integrations use fixed, migration-owned `identifold_*` object names and never interpolate unchecked identifiers into runtime statements. MongoDB and Firestore accept an optional validated collection prefix, while DynamoDB requires the caller to supply the provisioned table name. Configuration is validated once and frozen by the factory.

## 5. Normative storage contract

### 5.1 Random REF reservation

For `(reference, namespace, MID)`:

1. the first atomic reservation succeeds;
2. a competing reservation of the same REF cannot overwrite it;
3. exactly one of multiple concurrent contenders reports success;
4. failure leaves no partial mapping;
5. successful resolution returns the bound MID and namespace; and
6. a missing, well-formed REF resolves to `null`, not a parsing error.

A database uniqueness constraint, conditional write, or transaction supplies the authority. A preliminary read is never sufficient.

### 5.2 Sequential allocation

For `(namespace, scope, prefix, width, MID)`:

1. validate the policy before mutating state;
2. atomically advance the namespace-and-scope counter;
3. bind the value to the MID in the same transaction;
4. enforce unique sequence and MID bindings within the scope;
5. reject policy changes for an existing counter;
6. return `sequence_overflow` without advancing past the configured width; and
7. roll back both counter and binding when either operation fails.

The MID is the replay key. Repeating an allocation for the same MID, namespace, and scope returns the previously committed sequence when the prefix and width match. A conflicting replay returns `invalid_allocation_policy`. PostgreSQL receives a forward migration implementing this idempotent behavior so all backends share the same retry contract.

### 5.3 Resolution consistency

Resolution immediately following a successful reservation or allocation must be able to observe the committed mapping when the adapter uses its documented default. Backends with selectable consistency therefore use:

- primary or transaction-consistent reads for MongoDB;
- strongly consistent reads for DynamoDB reference lookup; and
- transaction reads for Firestore.

Applications may opt into weaker reads only through an explicit backend option that documents the stale-read risk.

### 5.4 Error mapping

Native errors map to existing Identifold codes:

- malformed policy → `invalid_allocation_policy`;
- exhausted fixed width → `sequence_overflow`;
- duplicate or transaction conflict after bounded retry → `allocation_conflict`;
- exhausted random-candidate retries at the service layer → `allocation_exhausted`.

Backend error details may be retained as a non-enumerable cause for diagnostics, but public messages must not expose credentials, connection strings, table contents, or personal data.

### 5.5 Retry policy

Random REF duplicate conflicts return `false` immediately because the service must generate a new candidate. Transient transaction conflicts may be retried internally up to five attempts with exponential full jitter. Tests inject the clock and jitter source. Backends whose SDK already retries receive one combined attempt budget so nested retry loops cannot grow without bound.

The factory accepts an override from one to ten attempts. Exhaustion maps to `allocation_conflict`; it never reports success from an uncertain commit without first resolving the MID replay key.

## 6. Shared storage-conformance harness

The harness is backend-neutral and accepts lifecycle commands plus an adapter factory. It runs the following suites.

### 6.1 Schema lifecycle

- clean setup succeeds;
- repeated setup is either idempotent or fails with a documented migration error;
- forward migrations preserve existing mappings;
- down migrations remove only integration-owned objects where reversible migrations are supported; and
- incompatible schema versions fail before allocation.

### 6.2 Random references

- reserve and resolve;
- duplicate REF with the same MID;
- duplicate REF with a different MID;
- case and collation behavior;
- 32 concurrent contenders with exactly one success;
- missing lookup; and
- rollback after injected failure.

### 6.3 Sequential references

- first and subsequent allocation;
- 32 concurrent allocations with no duplicate successful values;
- independent namespace and scope counters;
- calendar-year scope isolation;
- same-MID replay;
- conflicting policy replay;
- maximum-width boundary and overflow; and
- rollback after counter advancement but before binding.

### 6.4 Operational behavior

- restart persistence for local/container backends;
- bounded transient-conflict retry;
- consistent post-commit lookup;
- sanitized errors; and
- cleanup without leaked containers, databases, or emulator state.

Backend-specific suites may add stronger claims but cannot skip required cases silently. Any unsupported capability must be an explicit failing gate, not a documentation footnote.

## 7. Backend designs

### 7.1 MySQL 8.4 and MariaDB

Artifacts:

- `integrations/mysql/migrations/` with reversible SQL;
- InnoDB tables and procedures;
- `@greyfoundry/identifold/mysql` using `mysql2`;
- containerized MySQL 8.4 conformance; and
- a separately reported MariaDB compatibility job.

Random reservation uses a unique REF key and a stored duplicate-key handler that catches only the expected unique-constraint error; `INSERT IGNORE` is not used because it can conceal unrelated data errors. Sequential allocation locks the counter row with an InnoDB transaction, advances it, inserts the binding, and commits. The adapter uses raw `BINARY(16)` UUIDv7 bytes and never enables the UUIDv1 swap flag.

MariaDB is supported only after the same migrations and conformance suite pass against its pinned hosted version. Dialect differences use separate migration files rather than runtime SQL guessing.

### 7.2 SQLite

Artifacts:

- `integrations/sqlite/migrations/`;
- `@greyfoundry/identifold/sqlite` using `better-sqlite3`;
- file-backed and in-memory examples; and
- concurrency tests using multiple connections to one temporary database.

Random reservation uses a unique constraint with `INSERT ... ON CONFLICT DO NOTHING`. Sequential allocation uses `BEGIN IMMEDIATE` so the write lock is acquired before reading the counter. The adapter configures a bounded busy timeout and maps exhausted `SQLITE_BUSY` retries to `allocation_conflict`.

WAL is documented as an application choice for same-host reader/writer concurrency, not enabled silently. Network-filesystem WAL deployments are unsupported.

### 7.3 MongoDB

Artifacts:

- collection and index setup scripts;
- `@greyfoundry/identifold/mongodb` using the official `mongodb` driver;
- replica-set integration tests, because transactions require the appropriate deployment mode; and
- Atlas-compatible operational guidance.

A unique index on the canonical REF field enforces mapping uniqueness, with secondary indexes supporting namespace and MID queries. Random reservation is one insert. Sequential allocation uses a session transaction that updates the counter and inserts the allocation. Transaction retries are bounded and handle duplicate-key and write-conflict classifications explicitly.

### 7.4 DynamoDB

Artifacts:

- table-definition and infrastructure examples;
- `@greyfoundry/identifold/dynamodb` using AWS SDK v3;
- DynamoDB Local tests; and
- deployment guidance for on-demand and provisioned capacity.

Random reservation uses a conditional `PutItem` whose key cannot already exist. Sequential allocation uses `TransactWriteItems` to update the counter conditionally and insert the MID binding atomically. A plain standalone atomic counter is prohibited because retry ambiguity can overcount. Client request tokens provide transaction idempotency, while the stored MID binding provides durable replay behavior.

### 7.5 SQL Server

Artifacts:

- reversible T-SQL migrations and stored procedures;
- `@greyfoundry/identifold/sqlserver` using `mssql`;
- SQL Server container conformance; and
- Azure SQL compatibility guidance.

Random reservation uses a unique index and transaction-safe duplicate handling. Sequential allocation uses a locked counter row and binding insert in one transaction. SQL Server sequence objects are not used because consumed sequence values are not rolled back with the binding transaction.

### 7.6 Firestore

Artifacts:

- collection layout, index configuration, IAM, and security-rule guidance;
- `@greyfoundry/identifold/firestore` using `@google-cloud/firestore`;
- Firestore Emulator tests; and
- security-rule examples that deny direct untrusted allocation writes.

Canonical REF document IDs provide uniqueness for random reservation. Sequential allocation and binding occur in one Firestore transaction. Transaction retries must remain bounded at the adapter boundary, and application code must not bypass the server-side allocator with client SDK writes. Mobile and web writes are denied by rules; the privileged server adapter is restricted through IAM because server libraries bypass Firestore Security Rules.

### 7.7 CockroachDB and YugabyteDB certification

The existing PostgreSQL adapter and migrations run unchanged first. Each database receives its own conformance job, retry-policy documentation, and known-difference page. Passing a wire-protocol smoke test is insufficient; support is declared only after concurrency, rollback, idempotency, and migration gates pass. If either database requires behaviorally different migrations or procedures, it becomes a dedicated integration instead of being labeled PostgreSQL-compatible.

## 8. Package and dependency design

New exports:

- `@greyfoundry/identifold/storage` for shared structural types;
- `@greyfoundry/identifold/mysql`;
- `@greyfoundry/identifold/sqlite`;
- `@greyfoundry/identifold/mongodb`;
- `@greyfoundry/identifold/dynamodb`;
- `@greyfoundry/identifold/sqlserver`; and
- `@greyfoundry/identifold/firestore`.

TypeScript database drivers are optional peer dependencies and matching development dependencies. Importing `@greyfoundry/identifold` never loads a database driver. Each integration guide gives the application package plus driver installation command and supported driver range.

The existing `/postgres`, `/prisma`, and `/drizzle` exports remain backward compatible. PostgreSQL is migrated onto the shared adapter result and conformance harness without removing current factories.

Every published language follows an ecosystem-native isolation model:

| Language   | Integration packaging                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript | package subpath exports with optional peer drivers                                                                              |
| Python     | `identifold.storage` plus `mysql`, `mongodb`, `dynamodb`, `sqlserver`, and `firestore` extras; SQLite uses the standard library |
| Rust       | `storage` plus opt-in Cargo features for each driver                                                                            |
| Go         | `storage` and backend subpackages; applications import only the selected subpackages                                            |
| Java       | core storage interfaces in the existing artifact plus optional Maven driver dependencies                                        |
| Kotlin     | idiomatic coroutine wrappers over the Java storage contract and drivers                                                         |
| C#         | core storage interfaces plus backend namespaces and explicit NuGet driver dependencies                                          |
| Swift      | storage protocols plus backend targets selected as Swift Package products                                                       |
| Ruby       | `Identifold::Storage` plus backend files loaded explicitly; drivers remain optional gem dependencies                            |
| PHP        | `Greyfoundry\\Identifold\\Storage` plus backend namespaces; Composer suggests the selected driver packages                      |

The main identifier API remains usable without any database driver in every language. Driver dependencies are locked for tests, documented with supported ranges, and loaded only when the corresponding adapter is selected.

## 9. Repository layout

```text
conformance/storage/
  contract.md
  manifest.json
  fixtures/
  runners/
    typescript/
    python/
    rust/
    go/
    java/
    kotlin/
    csharp/
    swift/
    ruby/
    php/

integrations/
  postgres/
  mysql/
  sqlite/
  mongodb/
  dynamodb/
  sqlserver/
  firestore/

packages/<language>/
  storage contract
  postgres integration
  mysql integration
  sqlite integration
  mongodb integration
  dynamodb integration
  sqlserver integration
  firestore integration
```

Each integration directory contains a README, setup artifacts, one executable example per language, and backend-specific operations guidance. Package directories keep language-specific code in focused files or modules rather than a single generated implementation.

## 10. CI and branch protection

Each primary backend receives a ten-language test matrix and a stable aggregate hosted job name suitable for branch protection:

- `MySQL 8.4`;
- `SQLite`;
- `MongoDB`;
- `DynamoDB Local`;
- `SQL Server`;
- `Firestore Emulator`;
- `MariaDB compatibility`;
- `CockroachDB compatibility`; and
- `YugabyteDB compatibility`.

Jobs pin action revisions and backend versions, disable persisted checkout credentials, use least-privilege workflow permissions, and clean containers or emulator processes even after failure.

Every matrix reports the language explicitly. The stable aggregate check fails if any supported language is skipped, cancelled, or unsuccessful, so branch protection does not need seventy individually maintained check names.

DynamoDB Local and the Firestore Emulator are fast pull-request gates, not complete proof of managed-service behavior. Before stable support is declared, a protected release-environment workflow must run safe live reservation, replay, consistency, and cleanup tests against dedicated AWS and Google Cloud test resources. Credentials use OIDC federation and are never stored in the repository.

The shared contract tests run against PostgreSQL in all ten languages first. A new backend aggregate becomes required only when all ten implementations are complete and green, avoiding a permanently blocked `main` during development.

## 11. Delivery waves and gates

### Foundation

- shared storage types and conformance runners for all ten languages;
- PostgreSQL migrated to the harness;
- idempotent sequence replay migration;
- documentation and test fixtures.

Exit gate: PostgreSQL preserves all current behavior and passes every shared suite under concurrency in TypeScript, Python, Rust, Go, Java, Kotlin, C#, Swift, Ruby, and PHP.

### Wave 1: MySQL and SQLite

Exit gate: both backends pass lifecycle, reservation, resolution, sequential, rollback, and example suites in all ten languages; MySQL and SQLite aggregate jobs are protected.

### Wave 2: MongoDB and DynamoDB

Exit gate: both backends pass the same suites in all ten languages under replica-set and DynamoDB Local environments, with consistency and retry behavior documented; both aggregate jobs are protected.

### Wave 3: SQL Server and Firestore

Exit gate: both backends pass the same suites in all ten languages in SQL Server and Firestore Emulator environments, including server-side authorization guidance; both aggregate jobs are protected.

### Compatibility certification

Exit gate: MariaDB, CockroachDB, and YugabyteDB each pass every applicable shared suite through all ten language adapters and publish explicit differences; compatibility aggregate jobs are protected.

### Release

Exit gate:

- all new and existing checks are green on the release commit;
- managed DynamoDB and Firestore certification passes against dedicated live test resources;
- all seventy primary adapter examples execute;
- package exports, features, extras, companion modules, and optional dependency checks pass;
- migrations are tested from clean and prior schemas;
- wiki pages and root documentation are current;
- all ten language packages are published through their configured trusted or tokenless release paths where supported; and
- public installation is verified from every registry before release status is marked live.

## 12. Risks and mitigations

| Risk                                      | Mitigation                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| False portability from similar SQL syntax | Backend-specific artifacts judged by one behavioral harness                                |
| Counter gaps or duplicate bindings        | Transactional counter-row design and rollback injection tests                              |
| Cloud retry ambiguity                     | MID replay key, transaction idempotency, and bounded retries                               |
| Heavy optional driver surface             | Subpath isolation and optional peer dependencies                                           |
| CI cost and flakiness                     | One stable job per backend, health checks, cached images where safe, deterministic cleanup |
| Emulator behavior differs from production | Require protected live certification before declaring stable managed-service support       |
| Accidental authorization semantics        | Security tests and documentation preserve “identifiers identify” boundary                  |

## 13. Acceptance criteria

The program is complete only when:

- PostgreSQL, MySQL, SQLite, MongoDB, DynamoDB, SQL Server, and Firestore pass the shared contract in every one of the ten published languages;
- MariaDB, CockroachDB, and YugabyteDB have explicit passing compatibility certification through every language adapter;
- every language-and-backend integration has migration/setup, adapter, example, operations, and security documentation;
- concurrent random reservation yields exactly one winner;
- concurrent sequential allocation never duplicates a committed value;
- same-MID retries are idempotent across every backend;
- native errors map to the stable Identifold taxonomy;
- all new checks are required on protected `main`;
- the wiki and release matrix reflect verified rather than assumed support; and
- no temporary infrastructure, credentials, or generated state remains after verification.

## 14. Primary technical references

- [MySQL binary UUID conversion](https://dev.mysql.com/doc/refman/8.4/en/miscellaneous-functions.html)
- [MySQL unique indexes](https://dev.mysql.com/doc/refman/8.4/en/create-index.html)
- [SQLite transactions](https://www.sqlite.org/lang_transaction.html)
- [SQLite write-ahead logging](https://www.sqlite.org/wal.html)
- [SQLite UPSERT](https://www.sqlite.org/lang_UPSERT.html)
- [MongoDB unique indexes](https://www.mongodb.com/docs/manual/core/index-unique/)
- [MongoDB transaction production considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)
- [DynamoDB transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transactions.html)
- [DynamoDB atomic-counter limitations](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithItems.html)
- [SQL Server sequence transaction behavior](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-sequence-transact-sql)
- [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Firestore server-library IAM boundary](https://firebase.google.com/docs/firestore/security/rules-conditions)
