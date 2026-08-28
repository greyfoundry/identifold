# Conformance vectors

The JSON files in this directory define deterministic, language-neutral examples for Identifold implementations.

`manifest.json` lists the complete required corpus. Each vector file declares the draft specification version it targets. Implementations should consume the values as data rather than reproduce values from source code. `schema.json` describes the common envelope and each vector-file shape, including random and sequential REF profiles, round trips, and ordering.

Draft vectors may change incompatibly before Identifold 1.0. A stable vector set will be versioned with the specification and retained for compatibility testing. See `COMPATIBILITY.md` for manifest and version rules.
