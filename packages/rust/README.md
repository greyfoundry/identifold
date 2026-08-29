# Identifold for Rust

[![crates.io](https://img.shields.io/crates/v/identifold?logo=rust)](https://crates.io/crates/identifold)
[![docs.rs](https://img.shields.io/docsrs/identifold?logo=docs.rs)](https://docs.rs/identifold)
[![Languages CI](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)

The Rust crate implements the Identifold 1.0 MID, PID, and REF wire contract with stable error codes and no runtime dependencies beyond serialization for the conformance adapter.

## Install

```console
cargo add identifold@1.0.0
```

## Quick start

```rust
let pid = identifold::public_id_from_machine_id(mid, "order")?;
let parsed = identifold::parse_public_id(&pid)?;
```

## Verification

```console
cargo fmt --check
cargo test --locked
```

The `identifold-adapter` binary is exercised by the complete [language-neutral conformance suite](https://github.com/greyfoundry/identifold/tree/main/conformance). Version 1.0.0 is live on crates.io.
