# Identifold

[![CI](https://github.com/greyfoundry/identifold/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/ci.yml)
[![Languages](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)
[![Python](https://github.com/greyfoundry/identifold/actions/workflows/python.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/python.yml)
[![PostgreSQL](https://github.com/greyfoundry/identifold/actions/workflows/database.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/database.yml)
[![CodeQL](https://github.com/greyfoundry/identifold/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/codeql.yml)
[![GitHub release](https://img.shields.io/github/v/release/greyfoundry/identifold?display_name=tag&sort=semver)](https://github.com/greyfoundry/identifold/releases/latest)
[![License](https://img.shields.io/github/license/greyfoundry/identifold)](LICENSE)

**One identity. Three representations. Ten conforming implementations.**

Identifold is a stable, language-neutral identity contract for applications that need a UUIDv7 for storage, a typed public identifier for software, and a short checksummed reference for people.

```text
MID  019d4c72-c910-7a84-b313-53c3ac61a32f
PID  order_01kn675j8gfa2b64tkrep638sf
REF  ORD-7K4M-2P8Q-3D-9
```

## 🎯 Motivation

Application identifiers rarely have only one audience:

- databases need a compact, canonical key with predictable ordering;
- APIs and logs benefit from identifiers that carry their resource type; and
- people need references that are short enough to read, copy, and verify.

Using one format for all three jobs usually compromises at least one of them. Exposing raw UUIDs loses useful type context. Storing prefixed strings as primary keys couples presentation to persistence. Truncating identifiers for people creates collision and transcription risks.

Identifold exists to keep those responsibilities separate without creating three unrelated identities:

```text
MID <-> PID
REF -> storage -> MID
```

The MID and PID are deterministic representations of the same UUIDv7. A REF is independently allocated, checksummed, and resolved through application storage. That distinction makes uniqueness ownership explicit and avoids pretending a short human reference can be reversed without state.

The project also solves a cross-language problem: identifier rules tend to drift when every service reimplements conversion, normalization, checksums, and error handling. Identifold freezes one wire contract, one conformance corpus, and one error taxonomy, then verifies every implementation against the same public vectors.

## 📦 1.0 release status

Every supported implementation is conformant, published, and publicly installable at version 1.0.0.

| Language                | Distribution                                                                                         | Install coordinate                              | Release |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------- | :-----: |
| TypeScript / JavaScript | [npm](https://www.npmjs.com/package/@greyfoundry/identifold)                                         | `@greyfoundry/identifold`                       |  Live   |
| Python                  | [PyPI](https://pypi.org/project/identifold/1.0.0/)                                                   | `identifold`                                    |  Live   |
| Java                    | [Maven Central](https://central.sonatype.com/artifact/io.github.greyfoundry/identifold/1.0.0)        | `io.github.greyfoundry:identifold`              |  Live   |
| C#                      | [NuGet](https://www.nuget.org/packages/Greyfoundry.Identifold/1.0.0)                                 | `Greyfoundry.Identifold`                        |  Live   |
| Go                      | [Go package index](https://pkg.go.dev/github.com/greyfoundry/identifold/packages/go@v1.0.0)          | `github.com/greyfoundry/identifold/packages/go` |  Live   |
| PHP                     | [Packagist](https://packagist.org/packages/greyfoundry/identifold#1.0.0)                             | `greyfoundry/identifold`                        |  Live   |
| Kotlin                  | [Maven Central](https://central.sonatype.com/artifact/io.github.greyfoundry/identifold-kotlin/1.0.0) | `io.github.greyfoundry:identifold-kotlin`       |  Live   |
| Rust                    | [crates.io](https://crates.io/crates/identifold/1.0.0)                                               | `identifold`                                    |  Live   |
| Ruby                    | [RubyGems](https://rubygems.org/gems/identifold/versions/1.0.0)                                      | `identifold`                                    |  Live   |
| Swift                   | [Swift Package Manager](https://github.com/greyfoundry/identifold/releases/tag/v1.0.0)               | `https://github.com/greyfoundry/identifold.git` |  Live   |

See [IMPLEMENTATIONS.md](IMPLEMENTATIONS.md) for package directories, runtime requirements, and verification coverage.

## 🚀 Quick start

### TypeScript

```console
npm install @greyfoundry/identifold
```

```ts
import {
  createIdentifold,
  createNamespaceRegistry,
} from "@greyfoundry/identifold";

const registry = createNamespaceRegistry([{ publicPrefix: "user" }]);
const ids = createIdentifold({ registry });
const identity = await ids.create("user");

ids.parse(identity.pid);
ids.validate(identity.mid);
ids.inspect(identity.pid);
ids.normalize(identity.mid.toUpperCase());
```

### Python

```console
python -m pip install identifold
```

```python
from identifold import NamespaceRegistry, create_machine_id, public_id_from_machine_id

registry = NamespaceRegistry([{"publicPrefix": "user"}])
mid = create_machine_id()
pid = public_id_from_machine_id(mid, "user")
```

Tested production examples are available in [`examples/`](examples/README.md).

## Design boundaries

- Store the MID as the canonical identity, preferably in a native UUID or 16-byte database type.
- Derive the PID from the MID and registered public prefix unless an application has a specific indexing need.
- Store each REF as a separate unique value mapped to its MID and namespace.
- Implement random `ReferenceStore.reserve` as one atomic insert-or-conflict operation backed by a unique constraint.
- Implement `SequenceAllocator.allocate` so advancing a scoped sequence and binding it to a MID happen in the same transaction.
- Preserve retired namespace definitions for historical parsing.

An in-memory uniqueness check is not a production allocation boundary for multiple processes. Calendar-year sequence scopes use the UTC year.

## What is verified

The protected `main` branch requires 17 hosted checks covering:

- Node.js 22, 24, and 26;
- Python 3.12, 3.13, and 3.14;
- Go, Rust, Java, .NET, PHP, Ruby, Kotlin, and Swift;
- PostgreSQL 18 concurrency and allocation behavior; and
- CodeQL analysis for JavaScript, TypeScript, and Python.

Every language runs the same deterministic vectors through the [conformance runner](conformance/README.md). Package-specific builds, examples, formatting, type resolution, and publication checks run alongside that shared contract.

## Documentation

- [Stable specification](SPEC.md)
- [Implementation matrix](IMPLEMENTATIONS.md)
- [Compatibility policy](spec/compatibility.md)
- [Production examples](examples/README.md)
- [Conformance runner](conformance/README.md)
- [PostgreSQL integration](integrations/postgres/README.md)
- [Public roadmap](roadmap.md)
- [Security policy](SECURITY.md)

## Security boundary

Identifiers identify. They do not authenticate callers or authorize access. Knowledge of an identifier or reference must never grant access by itself.

## Standards

- UUIDv7 follows [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html).
- Public IDs follow [TypeID specification v0.3](https://github.com/jetify-com/typeid/tree/main/spec).
- Random reference payloads use the Crockford Base32 data alphabet and modulo-37 check-symbol convention.

## License

Apache-2.0. See [LICENSE](LICENSE).
