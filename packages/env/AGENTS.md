# `packages/env` — Validated Environment Variables

Single source of truth for runtime configuration. Built on `@t3-oss/env-core` + Zod so a missing or malformed var fails at process start with a readable error, not deep in a request handler.

## Layout

```
src/
  server.ts   # Node/Bun runtime — DB, auth, Redis, Kafka, ClickHouse
  web.ts      # Browser runtime — only VITE_-prefixed vars
```

Exposed as subpath exports:

```ts
import { env } from "@sbox-analytics/env/server";
import { env } from "@sbox-analytics/env/web";
```

## Conventions

- **Every new env var lives here.** No package may read `process.env.FOO` directly — go through `env.FOO` so the schema catches missing values.
- **Server vars stay in `server.ts`.** Anything that ends up in the browser bundle must be in `web.ts` and prefixed `VITE_`.
- **Provide a sensible local default only when it won't burn a prod deploy.** `REDIS_URL` defaults to `localhost:6379` because dev needs it; `BETTER_AUTH_SECRET` has no default because dev _should_ fail loudly if you skip setup.
- **Go services don't share this schema.** `apps/ingest` reads env itself in `internal/config/config.go` — keep the variable names aligned across both.

## Adding a variable

1. Add to the relevant Zod schema in `server.ts` or `web.ts`.
2. Add to `apps/server/.env` (and `apps/ingest/.env` if the Go service needs it).
3. Reference via `env.YOUR_VAR` at the call site.
