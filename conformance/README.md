# Conformance runner

[![Languages CI](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)
[![Stable release](https://img.shields.io/github/v/release/greyfoundry/identifold?display_name=tag&sort=semver)](https://github.com/greyfoundry/identifold/releases/latest)

The runner judges an implementation from `vectors/manifest.json` and the public vector files. It does not read implementation source.

## Run an adapter

```shell
python conformance/runner.py \
  --adapter conformance/typescript-adapter.mjs \
  --vectors vectors \
  --json
```

## Adapter protocol

An adapter is an executable `.py`, `.js`, or `.mjs` file. It receives one JSON request on standard input and returns one JSON response on standard output.

Success response:

```json
{ "ok": true, "value": "canonical-value" }
```

Validation failure response:

```json
{ "ok": false, "errorCode": "invalid_mid" }
```

Adapters receive only operation inputs and registry definitions. Expected values remain in the runner, preventing an adapter from passing by echoing expectations. The runner exits `0` when every case passes, `1` for conformance failures, and `2` for runner, manifest, or adapter failures.

The TypeScript adapter imports only the generated package output under `packages/typescript/dist`.

## What conformance means

A passing adapter agrees with the stable vectors for MID, PID, REF, normalization, ordering, round trips, and error classification. It does not certify application storage, authentication, authorization, or operational security.

The hosted suite currently runs adapters for TypeScript, Python, Go, Rust, Java, C#, PHP, Ruby, Kotlin, and Swift. See the [implementation matrix](https://github.com/greyfoundry/identifold/blob/main/IMPLEMENTATIONS.md) for public packages.

## Storage conformance

The [storage contract](storage/contract.md) separately certifies atomic REF reservation, lookup consistency, sequential allocation, replay, rollback, bounded retries, and sanitized storage errors. Its manifest names all ten language runners so a backend cannot be listed as fully supported while omitting one published package.

Storage certification is backend-specific. Local emulators do not replace the protected live-cloud checks required for DynamoDB and Firestore releases.
