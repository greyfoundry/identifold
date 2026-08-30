# Storage conformance contract

This contract defines the observable behavior required of every Identifold storage adapter. It is language-neutral and supplements the stable identifier vectors. Passing the identifier vectors alone does not certify storage behavior.

## Adapter boundary

An adapter groups three operations:

```text
reserve(machineId, namespace, reference) -> boolean
resolve(reference, namespace) -> mapping | null
allocate(machineId, namespace, referencePrefix, scope, width) -> unsigned integer
```

The adapter receives an already configured client, pool, connection factory, database, or collection root. It owns transactions opened for one operation but does not close caller-owned resources or run migrations.

All string inputs are canonical values already validated by the identifier layer. Adapters still use parameterized operations and fixed migration-owned object names.

## Reference reservation

`reserve` atomically creates a globally unique canonical REF mapping.

- The first reservation of a REF returns `true`.
- Any later reservation of the same REF returns `false`, including a repeat with the same MID.
- A losing reservation cannot replace or partially change the committed mapping.
- Under 32 concurrent contenders for one REF, exactly one returns `true`.
- A failure before commit leaves no resolvable mapping.

Database uniqueness, a conditional write, or a transaction is the authority. A read followed by an unprotected write is non-conforming.

## Resolution

`resolve` returns the canonical MID and namespace bound to the supplied canonical REF, or `null` when no mapping exists.

- The namespace in the stored mapping must equal the requested namespace.
- A successful reservation or allocation must be visible through the adapter's documented default read immediately after commit.
- MongoDB reads use the primary or a transaction-consistent path.
- DynamoDB reads use strong consistency.
- Firestore resolution uses a transaction-consistent server path.

Weaker reads may be offered only as an explicit backend option that documents stale-read risk. They are not used by conformance.

## Sequential allocation

`allocate` treats `(namespace, scope)` as the counter identity and MID as the replay key.

1. Validate prefix, width, scope, and retry configuration before mutation.
2. Read and advance the counter inside the same atomic unit as the MID binding.
3. Return the first value as `1` and advance by exactly one for each new MID.
4. Keep namespaces and scopes independent.
5. Return the previously committed value when the same MID is replayed with the same prefix and width.
6. Return `invalid_allocation_policy` when a replay changes prefix or width.
7. Return `sequence_overflow` without advancing when the next value exceeds `10^width - 1`.
8. Roll back both counter and binding when either part fails.
9. Under 32 concurrent new MIDs, commit 32 unique consecutive values.

Consumed values that cannot roll back with the mapping, including standalone database sequence objects and non-transactional cloud counters, are non-conforming.

## Retry behavior

Transient transaction conflicts default to a combined maximum of five attempts. Adapter configuration accepts integer limits from one through ten.

- A duplicate random REF returns `false` immediately so the identifier service can generate another candidate.
- Retriable conflicts use exponential full jitter with injectable time and randomness in tests.
- SDK retry behavior counts toward the same operation budget.
- Exhaustion returns `allocation_conflict`.
- An uncertain commit is resolved through the stored MID replay binding before success or failure is reported.

## Error mapping

Adapters use the stable public codes:

| Condition                                | Code                        |
| ---------------------------------------- | --------------------------- |
| malformed or conflicting policy          | `invalid_allocation_policy` |
| fixed-width capacity exhausted           | `sequence_overflow`         |
| transaction conflict or retry exhaustion | `allocation_conflict`       |

Random-candidate exhaustion remains a service-layer `allocation_exhausted` error and is not produced by a storage adapter.

Public error messages must not contain driver messages, credentials, connection strings, record contents, REF values, MIDs, email addresses, or personal data. Native diagnostics may be retained only through an ecosystem-appropriate non-public cause.

## Lifecycle and cleanup

Each backend must prove:

- clean setup;
- documented repeated-setup behavior;
- forward migration without mapping loss;
- ownership-safe down migration where supported;
- rejection of an incompatible schema before allocation;
- persistence across restart for local or container services; and
- cleanup of test-owned containers, databases, tables, collections, emulator processes, and temporary files after success or failure.

## Fixture execution

[`manifest.json`](manifest.json) lists every language runner and fixture suite. Fixture case IDs are normative and unique. A runner may add backend-specific cases but may not skip, reinterpret, or silently mark a mandatory case successful.

Emulators prove the contract against local service behavior. Stable DynamoDB and Firestore support additionally requires protected live-cloud certification with dedicated resources, federated credentials, and verified cleanup.
