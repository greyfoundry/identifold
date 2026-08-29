# Production examples

[![CI](https://github.com/greyfoundry/identifold/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/ci.yml)
[![Python](https://github.com/greyfoundry/identifold/actions/workflows/python.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/python.yml)

These programs are compiled or executed in the release verification pipeline. They demonstrate the supported package APIs while keeping the MID as the source of truth and deriving a typed PID for external use.

## TypeScript / JavaScript

The TypeScript example imports the workspace package exactly as a consumer would, creates an `order` identity, and verifies the MID/PID round trip.

```console
pnpm install --frozen-lockfile
pnpm --dir examples/typescript test
pnpm --dir examples/typescript start
```

## Python

The Python example exercises the public package API and emits the resulting identity as JSON.

```console
python -m pip install -e packages/python
python examples/python/basic.py
```

## Release gate

Both examples are production artifacts rather than illustrative snippets:

- TypeScript is compiled with the repository's strict TypeScript configuration before execution;
- Python runs on every supported Python release in hosted CI; and
- the examples must stay green before a stable release is considered complete.

See the [root quick start](https://github.com/greyfoundry/identifold#-quick-start) for registry-based installation.
