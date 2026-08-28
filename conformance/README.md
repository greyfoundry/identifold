# Conformance runner

The runner judges an implementation from `vectors/manifest.json` and the public vector files. It does not read implementation source.

```shell
python conformance/runner.py \
  --adapter conformance/typescript-adapter.mjs \
  --vectors vectors \
  --json
```

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
