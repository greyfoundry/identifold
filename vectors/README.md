# Conformance vectors

[![Languages CI](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)
[![Contract](https://img.shields.io/badge/contract-Identifold%201.0-5B5BD6)](../SPEC.md)

The JSON files in this directory define deterministic, language-neutral examples for Identifold implementations.

## Contents

- `manifest.json` lists the complete required corpus in execution order.
- `schema.json` defines the common envelope and each vector-file shape.
- Vector files cover MID, PID, REF, normalization, round trips, ordering, and stable failures.

Implementations should consume expected values as data rather than reproduce them from source code. Adapters receive only operation inputs; expected answers stay inside the runner.

## Compatibility

The current vectors target the stable Identifold 1.0 contract. Stable vector sets are retained for compatibility testing, and incompatible future changes require a new contract version. See [COMPATIBILITY.md](COMPATIBILITY.md) for manifest and version rules and [conformance/README.md](../conformance/README.md) for the adapter protocol.
