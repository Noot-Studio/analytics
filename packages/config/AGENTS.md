# `packages/config` — Shared TypeScript Config

Single-purpose: holds `tsconfig.base.json` so every TS package extends one set of compiler options. No code, no exports.

## Contents

```
tsconfig.base.json   # The base every workspace tsconfig extends from
package.json         # Empty private package — just declares the workspace name
```

## When to touch it

- Bumping the TS target / lib / module settings — change once, every package picks it up after their `tsc -b`.
- Adding/removing strictness flags — discuss before relaxing; the project leans strict on purpose.

## When _not_ to touch it

- Per-app overrides (e.g. JSX, bundler-specific paths) belong in each package's own `tsconfig.json` via `extends` + targeted overrides. Don't push app concerns into the base.
- Runtime config, env schemas, or feature flags — wrong package. Those live in `packages/env` or the relevant app.
