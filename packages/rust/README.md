# Identifold for Rust

The Rust crate implements the Identifold 1.0 MID, PID, and REF wire contract with stable error codes and no runtime dependencies beyond serialization for the conformance adapter.

```rust
let pid = identifold::public_id_from_machine_id(mid, "order")?;
let parsed = identifold::parse_public_id(&pid)?;
```

Run `cargo test` for package tests. The `identifold-adapter` binary is exercised by the language-neutral conformance runner.
