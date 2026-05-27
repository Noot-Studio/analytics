# `packages/api` — oRPC Router & Business Logic

The single source of truth for the dashboard's API surface. Exports `appRouter` (consumed by `apps/server`) and `AppRouter` / `AppRouterClient` types (consumed by `apps/web` for end-to-end type safety).

## Layout

```
src/
  index.ts          # `o`, `publicProcedure`, `protectedProcedure` builders
  context.ts        # createContext({ context: HonoContext }) — resolves the Better Auth session
  clickhouse.ts     # Singleton ClickHouse client (async_insert on)
  routers/
    index.ts        # Aggregates every router into `appRouter`
    analytics.ts    # ClickHouse-backed queries (daily rollup, recent events)
```

## Conventions

- **Two procedure builders, no third.** Public for unauthenticated endpoints, protected for everything that needs `session.user`. Add a new middleware on `publicProcedure` rather than a parallel builder.
- **Validate inputs with Zod.** All `.input(...)` should be a Zod schema — that's what generates the OpenAPI spec served by `apps/server`.
- **Authorize before querying.** Anything scoped to a project must call an ownership/membership check (see `assertProjectOwnership` in `analytics.ts`) before hitting the DB.
- **Postgres via Prisma, analytics via ClickHouse.** Don't cross the streams: user/project/billing data lives in Postgres, time-series events in ClickHouse.
- **ClickHouse parameters use `{name:Type}` placeholders**, never string concatenation — prevents injection and lets the server cache the query plan.

## Adding a router

1. Create `src/routers/<feature>.ts` exporting an object of procedures.
2. Re-export it under a namespace in `src/routers/index.ts` (e.g. `analytics: analyticsRouter`).
3. `apps/server` and `apps/web` automatically see the new shape via the exported type — no codegen step.

## What does _not_ belong here

- HTTP wiring (CORS, middleware) — that's `apps/server`.
- Auth configuration — that's `packages/auth`.
- The ingestion path — Go service in `apps/ingest`, which never touches this package.
