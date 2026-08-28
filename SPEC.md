# Identifold specification

Status: Draft 0.1

## 1. Scope

Identifold defines one entity identity with up to three representations:

- **MID**, the canonical machine identifier;
- **PID**, the deterministic typed public identifier;
- **REF**, an independently allocated human reference.

The specification defines wire formats, normalization, validation, namespace registration, allocation boundaries, and conformance behavior. It does not define authentication, authorization, database products, or application-specific access control.

Normative terms such as MUST, MUST NOT, SHOULD, and MAY are interpreted as described by RFC 2119 and RFC 8174 when written in uppercase.

## 2. Identity relationships

An entity MUST have exactly one MID.

A PID MUST contain exactly the same 128 bits as its MID. Converting between a MID and PID is deterministic when the public namespace is known.

A REF MUST NOT encode or truncate the MID. A REF resolves to its MID through application storage. Implementations MUST NOT claim that a generated REF is unique until an atomic allocator or storage operation has accepted it.

```text
MID <-> PID
REF -> storage -> MID
```

## 3. Machine identifier

A MID MUST be an RFC 9562 UUIDv7 using the OSF DCE/IETF variant.

The canonical string form MUST be 36 lowercase ASCII characters in the `8-4-4-4-12` hexadecimal layout. Parsers MAY accept uppercase hexadecimal but normalization MUST return lowercase canonical form.

Generation SHOULD use a mature RFC 9562 implementation. Identifold implementations MUST NOT weaken the generator's randomness or monotonicity guarantees.

The MID carries a millisecond timestamp. Applications MUST treat that timestamp as observable metadata, not as an authorization claim or trusted event time.

## 4. Public identifier

A PID MUST conform exactly to TypeID specification v0.3.

Its canonical form is:

```text
<public-prefix>_<26-character TypeID suffix>
```

The prefix MUST be 1 to 63 characters of lowercase ASCII snake case accepted by TypeID v0.3. The suffix MUST decode to the same UUIDv7 bits as the MID. PIDs MUST use canonical lowercase encoding.

An implementation claiming Identifold compatibility MUST pass the upstream TypeID v0.3 vectors in addition to Identifold vectors. Extensions to the TypeID prefix or suffix grammar are not Identifold PIDs.

## 5. Human reference

A REF is allocated independently from the MID and PID. The registered namespace determines its strategy.

The random strategy uses:

```text
<REF-PREFIX>-<PAYLOAD-GROUPS>-<CHECK>
```

The REF prefix MUST be 2 to 8 uppercase ASCII letters and MUST be unique case-insensitively within a registry. Random payload symbols use:

```text
0123456789ABCDEFGHJKMNPQRSTVWXYZ
```

The standard profile contains 10 payload symbols, providing 50 random bits before collision handling. Canonical grouping is four symbols from the left, followed by the remaining symbols, followed by the check symbol. For example, a 10-symbol payload is grouped `4-4-2`.

The check symbol MUST use the Crockford modulo-37 convention described in `spec/checksums.md`.

Parsers MUST accept lowercase input, omitted hyphens, and the Crockford data aliases `O` to `0` and `I` or `L` to `1` within the payload. Normalization MUST emit uppercase canonical symbols and canonical hyphens. Aliases do not apply to the REF prefix or check symbol.

Random payload generation MUST use a cryptographically secure random-number generator and unbiased sampling. A unique storage constraint plus bounded retry is REQUIRED before uniqueness may be claimed.

Sequential references use an external transactional allocator. Their canonical grammar and allocation contract are defined in `spec/human-reference.md`; the allocator MUST advance its namespace-and-scope counter and bind the allocated value to the MID in one transaction. Calendar-year scopes use the UTC year. A process-local counter is not a conforming allocator for shared production state.

## 6. Namespace registry

A namespace definition binds one public prefix to zero or one REF configuration. Definitions MUST be validated together and frozen before use.

Public prefixes MUST be unique. REF prefixes MUST be unique case-insensitively and prefix-free so that hyphenless input has exactly one possible namespace. A registry MUST reject duplicates, ambiguous REF prefixes, and malformed definitions atomically.

A published namespace meaning MUST NOT be reassigned. A wire-incompatible change requires a new namespace or a new major specification version.

Raw MIDs contain no namespace. Inspection of a MID MUST NOT infer a namespace. PID and REF prefixes identify a registered namespace only when the active registry contains that prefix.

## 7. Unified operations

The default API exposes:

- `create(namespace)`;
- `parse(value)`;
- `validate(value)`;
- `inspect(value)`;
- `normalize(value)`.

`create(namespace)` MAY be a convenience operation, but when a namespace has references enabled it MUST cross the configured reservation or allocation boundary before returning a REF as allocated.

`parse` and `normalize` are syntactic operations. They MUST NOT imply that a REF exists in storage.

`inspect` MUST distinguish syntactic validity from registry recognition, checksum validity, UUID version, and storage resolution. It MUST NOT report a REF as resolved unless a resolver was explicitly invoked.

## 8. Errors

Conforming implementations MUST expose stable machine-readable error codes. At minimum:

- `invalid_kind`;
- `invalid_allocation_policy`;
- `invalid_mid`;
- `invalid_uuid_version`;
- `invalid_pid`;
- `invalid_public_prefix`;
- `unknown_namespace`;
- `invalid_ref`;
- `invalid_ref_prefix`;
- `ambiguous_ref_prefix`;
- `invalid_ref_length`;
- `invalid_ref_symbol`;
- `invalid_checksum`;
- `allocation_required`;
- `allocation_conflict`;
- `allocation_exhausted`;
- `sequence_overflow`.

Error messages MAY vary by language. Error codes and the input classification that produces them are part of the conformance contract.

## 9. Security

Identifiers identify. Tokens authenticate. Policies authorize.

Possession of a MID, PID, or REF MUST NOT grant access. Implementations MUST use cryptographically secure randomness for random references, MUST bound collision retries, and MUST avoid including secrets in errors or inspection output.

UUIDv7 reveals approximate creation time. Sequential references reveal volume and ordering. Applications MUST choose strategies with those disclosures understood.

## 10. Conformance and versioning

Language-neutral JSON vectors are the compatibility contract. Vectors MUST include canonical values, accepted non-canonical inputs, invalid inputs, stable error codes, and deterministic dependency-injected generation cases.

`spec/manifest.json` indexes the normative rule groups, executable canonical examples, stable error taxonomy, and explicit exclusions for this draft. `spec/compatibility.md` defines the compatibility policy.

Draft versions may change incompatibly. After 1.0, incompatible wire-format or normative behavior changes require a new major specification version.

Supporting documents under `spec/` expand these rules. If supporting prose conflicts with this file, this file controls until the conflict is corrected.
