# Specification compatibility

Identifold `1.0` defines one stable wire contract for MID, PID, and REF values. `spec/manifest.json` records its stable error taxonomy, executable canonical examples, rule evidence, release requirements, and explicit exclusions.

## Stable policy

Every vector file declares the specification version it targets, and implementations must reject a vector manifest version they do not support. Changes that alter parsing, normalization, canonical formatting, checksum calculation, namespace meaning, or stable error classification require a new major specification version. Additive APIs that do not alter wire behavior may be introduced in a minor release.

Published namespace meanings are permanent within a major specification version. Retired namespaces remain valid for historical parsing.

## Explicit exclusions

The first stable specification does not define:

- authentication or authorization;
- automatic conversion of unrelated legacy identifiers;
- custom wire formats, alphabets, or checksum rules; or
- distributed REF resolution protocols.

Applications may provide those facilities around Identifold, but they are not part of compatibility claims. Legacy identifiers require stored aliases when no deterministic relationship exists. REF resolution remains an explicit application storage operation.

There are no unresolved wire-format questions inside the `1.0` scope. New requirements outside that scope must enter through a versioned proposal and cannot silently weaken the default rules.
