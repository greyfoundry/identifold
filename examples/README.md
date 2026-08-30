# Production examples

[![CI](https://github.com/greyfoundry/identifold/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/ci.yml)
[![Python](https://github.com/greyfoundry/identifold/actions/workflows/python.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/python.yml)
[![Languages](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)

These programs are compiled or executed in the protected verification pipeline. Every supported language demonstrates the public package API while keeping the MID as the source of truth, deriving a typed PID, and proving that parsing returns the original MID.

All examples emit the same JSON-shaped result:

```json
{
  "mid": "019d4c72-c910-7a84-b313-53c3ac61a32f",
  "namespace": "order",
  "pid": "order_01kn675j8gfa2b64tkrep638sf",
  "roundTrip": true
}
```

TypeScript and Python create fresh UUIDv7 values in their full examples. The other ports use the stable MID above because their 1.0 core packages focus on wire conversion, parsing, normalization, REF operations, and conformance.

## TypeScript / JavaScript

[`typescript/basic.ts`](typescript/basic.ts) imports the workspace package exactly as a consumer would and has a separate assertion runner.

```console
pnpm install --frozen-lockfile
pnpm --dir examples/typescript test
pnpm --dir examples/typescript start
```

## Python

[`python/basic.py`](python/basic.py) exercises the installed public package API and is imported by the Python package tests.

```console
python -m pip install -e packages/python
python examples/python/basic.py
```

## Java

[`java/Basic.java`](java/Basic.java) is compiled against the Java 17 package classes and executed by the Java job.

```console
mvn --batch-mode --no-transfer-progress --file packages/java/pom.xml package
javac --release 17 -d .private/examples/java packages/java/src/main/java/io/greyfoundry/identifold/Identifold.java examples/java/Basic.java
java -cp .private/examples/java Basic
```

## C#

[`csharp/Identifold.Example.csproj`](csharp/Identifold.Example.csproj) consumes the library through a project reference, the local equivalent of the published NuGet dependency.

```console
dotnet run --project examples/csharp/Identifold.Example.csproj
```

## Go

[`go/go.mod`](go/go.mod) requires the public module coordinate and replaces it with the local package only for repository verification.

```console
cd examples/go
go run .
```

## PHP

[`php/composer.json`](php/composer.json) consumes the Composer package through a local path repository.

```console
cd examples/php
composer install
php basic.php
```

## Kotlin

[`kotlin/Basic.kt`](kotlin/Basic.kt) is compiled against the Kotlin facade and Java core by the Kotlin 2.4 workflow.

```console
mvn --batch-mode --no-transfer-progress --file packages/java/pom.xml install
mvn --batch-mode --no-transfer-progress --file packages/kotlin/pom.xml package
kotlinc -classpath packages/java/target/classes:packages/kotlin/target/classes examples/kotlin/Basic.kt -d .private/examples/kotlin
kotlin -classpath packages/java/target/classes:packages/kotlin/target/classes:.private/examples/kotlin BasicKt
```

## Rust

[`rust/Cargo.toml`](rust/Cargo.toml) consumes the crate through a local path dependency and carries its own lockfile.

```console
cargo run --locked --manifest-path examples/rust/Cargo.toml
```

## Ruby

[`ruby/Gemfile`](ruby/Gemfile) resolves the gem from the local package directory before executing the example.

```console
cd examples/ruby
bundle install
bundle exec ruby basic.rb
```

## Swift

[`swift/main.swift`](swift/main.swift) is an executable target in the root Swift package.

```console
swift run IdentifoldExample
```

## Release gate

These are production artifacts rather than illustrative snippets:

- TypeScript is compiled with the repository's strict TypeScript configuration before execution;
- Python runs on every supported Python release in hosted CI; and
- each remaining example compiles or runs inside its language's required hosted job; and
- all ten examples must stay green before a stable release is considered complete.

See the [root install table](https://github.com/greyfoundry/identifold#-install) or the [wiki installation guide](https://github.com/greyfoundry/identifold/wiki/Installation) for registry-based dependencies.
