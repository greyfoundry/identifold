# Advanced extensions

Registry exchange format version `1` serializes normalized namespace definitions and imports them through the same validation used by local registries. Unsupported versions fail closed. Exported structures are immutable and do not change core parsing behavior.

`createReferenceResolver` is an explicit storage boundary. It canonicalizes and validates a REF before lookup, verifies that the returned namespace agrees with the parsed REF, and validates the returned MID. A missing mapping returns `null`. Syntactic `inspect`, `parse`, and `normalize` remain storage-independent.

Custom alphabets, checksum profiles, reference strategies, and grouping remain excluded. Each would change validation or a wire format and needs a concrete consumer, a security analysis, conformance vectors, and a versioned exchange contract before inclusion. The default package requires no extension configuration.
