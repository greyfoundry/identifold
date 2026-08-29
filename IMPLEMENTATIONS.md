# Identifold implementations

Every implementation listed here targets the stable Identifold 1.0 wire contract and the complete language-neutral conformance suite.

| Language                  | Package coordinate                                       | Package directory     | Status                                  |
| ------------------------- | -------------------------------------------------------- | --------------------- | --------------------------------------- |
| TypeScript and JavaScript | npm: `@greyfoundry/identifold`                           | `packages/typescript` | Conformant; production example verified |
| Python                    | PyPI: `identifold`                                       | `packages/python`     | Conformant; production example verified |
| Java                      | Maven: `io.github.greyfoundry:identifold`                | `packages/java`       | Conformant                              |
| C#                        | NuGet: `Greyfoundry.Identifold`                          | `packages/csharp`     | Conformant                              |
| Go                        | `github.com/greyfoundry/identifold/packages/go`          | `packages/go`         | Conformant                              |
| PHP                       | Composer: `greyfoundry/identifold`                       | `packages/php`        | Conformant                              |
| Kotlin                    | Maven: `io.github.greyfoundry:identifold-kotlin`         | `packages/kotlin`     | Conformant                              |
| Rust                      | crates.io: `identifold`                                  | `packages/rust`       | Conformant                              |
| Ruby                      | RubyGems: `identifold`                                   | `packages/ruby`       | Conformant                              |
| Swift                     | SwiftPM: `https://github.com/greyfoundry/identifold.git` | `packages/swift`      | Conformant                              |

An implementation becomes conformant only after it passes all required vectors without changing their values, normalization rules, or stable error classifications.

The GitHub `v1.0.0` release contains the source for every implementation. External package registries are independent publication targets; a coordinate is installable from its registry only after that registry lists the release. The Go submodule additionally uses the `packages/go/v1.0.0` tag required by Go module versioning.
