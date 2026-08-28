# Human references

## Random strategy

Random references are independently allocated identifiers intended for verbal communication, support workflows, printed material, and user interfaces.

Profiles:

| Profile  | Payload symbols | Random bits | Canonical grouping |
| -------- | --------------: | ----------: | ------------------ |
| compact  |               8 |          40 | `4-4`              |
| standard |              10 |          50 | `4-4-2`            |
| high     |              12 |          60 | `4-4-4`            |

`standard` is the default. `compact` requires an explicit namespace choice and is suitable only when expected namespace volume and collision handling justify the smaller space.

Generation uses a cryptographically secure byte source. An implementation MAY consume the low five bits of each uniformly random byte because 256 is evenly divisible by the 32-symbol alphabet size. Rejection sampling is also conforming. Implementations MUST NOT use a transformation that biases symbols.

Generation produces a candidate. Allocation consists of atomically reserving the candidate against the registered REF namespace and MID. On conflict, the allocator retries with a new candidate up to a configured positive limit. Exhaustion returns `allocation_exhausted`.

## Sequential strategy

Sequential references are explicit because they disclose ordering and volume.

The first sequential profile is:

```text
<REF-PREFIX>-<SCOPE>-<SEQUENCE>-<CHECK>
```

Rules:

- scope is either absent or a four-digit calendar year;
- sequence is an unsigned decimal integer rendered to the namespace's fixed width with leading zeroes;
- width MUST be between 4 and 18 digits;
- a value larger than the configured width returns `sequence_overflow`;
- the check symbol is calculated over the decimal scope followed by the fixed-width sequence, or only the sequence when scope is absent;
- sequence allocation MUST be owned by a transactional external allocator;
- calendar-year allocation MUST derive its four digits from the UTC year;
- the allocator MUST advance the namespace-and-scope counter and bind the sequence to the supplied MID in the same transaction;
- uniqueness MUST be enforced over the canonical full reference.

Example shape:

```text
INV-2026-001842-M
```

The example is reproduced in `vectors/sequential.json`.

## Parsing and normalization

Random input may omit hyphens and may use lowercase. The parser identifies the REF prefix through the active registry, applies that namespace's strategy and lengths, normalizes allowed aliases in the payload, and validates the check symbol.

Sequential input may omit all hyphens and may use lowercase prefix and check-symbol characters, but MUST retain decimal digits exactly. Partially hyphenated input is invalid. Normalization restores the registered uppercase prefix, fixed-width sequence, and canonical hyphens.

A syntactically valid REF is not necessarily allocated. Resolution is a separate storage operation.
