# Security model

Identifold values are identifiers, not credentials.

Applications MUST authorize every operation independently of whether the caller knows a MID, PID, or REF. A REF's smaller and more convenient representation does not make it a secret.

## Observable information

- UUIDv7 and its PID representation expose an approximate creation timestamp.
- Type prefixes expose entity categories.
- REF prefixes expose entity categories.
- sequential references expose ordering and approximate volume.

Applications with incompatible disclosure requirements should not expose those representations in that context.

## Randomness

Random REF payloads require a cryptographically secure random-number generator. Custom random sources are permitted for deterministic testing, but production APIs SHOULD make insecure sources difficult to configure accidentally.

## Collision handling

Reference-space calculations do not replace storage enforcement. Every allocated REF requires an atomic uniqueness boundary. Retry counts MUST be finite. Errors MUST not disclose unrelated existing references or records.

## Parsing

Parsers MUST bound accepted input length before expensive processing. They MUST reject control characters and non-ASCII lookalikes. Normalization applies only to the explicitly permitted ASCII case, hyphen, and Crockford payload aliases.

## Logging

Libraries SHOULD return structured error codes without echoing full untrusted input by default. Applications SHOULD treat mappings between REF and MID as potentially sensitive operational data even though neither value authenticates a caller.
