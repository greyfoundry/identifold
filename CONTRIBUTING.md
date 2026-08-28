# Contributing

Identifold is specification-first. Changes to a wire format or normative behavior must update the specification and language-neutral vectors before or with implementation changes.

## Development

Requirements:

- Node.js 22 or newer;
- pnpm 10.33.0 or a compatible pnpm 10 release.

Install and verify:

```sh
pnpm install --frozen-lockfile
pnpm verify
```

Tests should describe observable behavior, use literal independently derived expectations, and include invalid boundary cases. Compatibility changes require vectors that can be consumed without reading the TypeScript source.

## Pull requests

Keep changes focused. Explain user-visible behavior, compatibility impact, security implications, and verification performed. Do not include secrets, production identifiers, or private data in fixtures or reports.
