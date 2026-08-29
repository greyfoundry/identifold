# Identifold implementations

[![Languages](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)
[![Python](https://github.com/greyfoundry/identifold/actions/workflows/python.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/python.yml)
[![Release](https://img.shields.io/github/v/release/greyfoundry/identifold?display_name=tag&sort=semver)](https://github.com/greyfoundry/identifold/releases/latest)

Every implementation targets the stable Identifold 1.0 wire contract and passes the complete language-neutral conformance suite.

| Language                | Runtime floor     | Package coordinate                               | Source                                       |                                     1.0.0 distribution                                      |
| ----------------------- | ----------------- | ------------------------------------------------ | -------------------------------------------- | :-----------------------------------------------------------------------------------------: |
| TypeScript / JavaScript | Node.js 22        | npm: `@greyfoundry/identifold`                   | [`packages/typescript`](packages/typescript) |            [Live](https://www.npmjs.com/package/@greyfoundry/identifold/v/1.0.0)            |
| Python                  | Python 3.12       | PyPI: `identifold`                               | [`packages/python`](packages/python)         |                     [Live](https://pypi.org/project/identifold/1.0.0/)                      |
| Java                    | Java 17           | Maven: `io.github.greyfoundry:identifold`        | [`packages/java`](packages/java)             |    [Live](https://central.sonatype.com/artifact/io.github.greyfoundry/identifold/1.0.0)     |
| C#                      | .NET 9            | NuGet: `Greyfoundry.Identifold`                  | [`packages/csharp`](packages/csharp)         |             [Live](https://www.nuget.org/packages/Greyfoundry.Identifold/1.0.0)             |
| Go                      | Go 1.23           | `github.com/greyfoundry/identifold/packages/go`  | [`packages/go`](packages/go)                 |       [Live](https://pkg.go.dev/github.com/greyfoundry/identifold/packages/go@v1.0.0)       |
| PHP                     | PHP 8.2           | Composer: `greyfoundry/identifold`               | [`packages/php`](packages/php)               |             [Live](https://packagist.org/packages/greyfoundry/identifold#1.0.0)             |
| Kotlin                  | Java 17           | Maven: `io.github.greyfoundry:identifold-kotlin` | [`packages/kotlin`](packages/kotlin)         | [Live](https://central.sonatype.com/artifact/io.github.greyfoundry/identifold-kotlin/1.0.0) |
| Rust                    | Rust 2024 edition | crates.io: `identifold`                          | [`packages/rust`](packages/rust)             |                      [Live](https://crates.io/crates/identifold/1.0.0)                      |
| Ruby                    | Ruby 3.2          | RubyGems: `identifold`                           | [`packages/ruby`](packages/ruby)             |                 [Live](https://rubygems.org/gems/identifold/versions/1.0.0)                 |
| Swift                   | Swift 6           | SwiftPM repository URL                           | [`packages/swift`](packages/swift)           |            [Live](https://github.com/greyfoundry/identifold/releases/tag/v1.0.0)            |

## ✅ Conformance contract

An implementation is conformant only when it passes every required vector without changing values, normalization rules, or stable error classifications. The adapters communicate with the runner through JSON lines and do not read expected answers from implementation source.

All ten implementations currently pass:

- UUIDv7 MID parsing, validation, and ordering;
- TypeID-compatible PID conversion and normalization;
- random and sequential REF formatting and checksums;
- round-trip and invalid-input vectors; and
- the shared stable error taxonomy.

## Release model

The GitHub [`v1.0.0`](https://github.com/greyfoundry/identifold/releases/tag/v1.0.0) release contains the canonical source for every implementation. Each registry remains an independent distribution target:

- the Go submodule uses the required `packages/go/v1.0.0` module tag;
- PHP is mirrored to the approved [`identifold-php`](https://github.com/greyfoundry/identifold-php) split repository for Packagist;
- Swift Package Manager consumes the root repository tag; and
- npm, PyPI, NuGet, Maven Central, crates.io, and RubyGems are published by the protected release workflow.

The table above reflects registry responses verified after publication, not only successful build jobs.
