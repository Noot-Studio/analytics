# `apps/server` — Web API Backend (Hono + oRPC)

The dashboard's backend. Serves the oRPC router from `@sbox-analytics/api`, the Better Auth handler, and an OpenAPI reference UI. This is **not** the event ingestion path — see `apps/ingest` for that.

## Responsibilities

- Mount `appRouter` (from `packages/api`) at `/rpc` for the React dashboard.
- Mount `auth.handler` at `/api/auth/*` for sessions, OAuth, email/password.
- Expose an OpenAPI reference at `/api-reference`.
- Wrap everything in `evlog` for structured wide-event logging and auth-identified requests.

## Layout

```
src/index.ts   # The whole server: CORS, evlog, auth identify, oRPC + OpenAPI handlers
.env           # Local secrets and connection strings (gitignored)
```

The router itself lives in `packages/api` so it can be type-imported by `apps/web`.

## Run locally

- `bun run dev:server` — `bun run --hot src/index.ts`, port 3000.
- Required env: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, `DATABASE_URL`, plus the ClickHouse vars used by the analytics router.

## Conventions

- Keep `src/index.ts` thin — wiring only. Business logic belongs in `packages/api` (procedures) or `packages/auth` (Better Auth config).
- New router branches: add them in `packages/api/src/routers/` and re-export from `routers/index.ts`. No changes needed here.
- All env access goes through `@sbox-analytics/env/server` — never read `process.env` directly.
- Logs: use `c.get("log")` from the `evlog` middleware, not `console`.

## Build / deploy

- `bun run build` (tsdown) or `bun run compile` (single binary via `bun build --compile`).
- Designed to run behind Dokploy on the OVH VPS; CORS origin is the dashboard's URL.
