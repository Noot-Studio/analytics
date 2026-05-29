---
name: add-orpc-route
description: Add or modify an oRPC endpoint in s&box Analytics, wiring the full chain consistently — router in packages/api, zod input/output schema, and the apps/web client call. Use when exposing new backend functionality to the dashboard.
---

# add-orpc-route

Adding an endpoint touches a repeated chain. Keep all links consistent.

## The chain

1. **Schema (zod)** — define input + output schemas (`@orpc/zod`). Validate all input; never trust client-supplied IDs without org/project scoping.
2. **Router** (`packages/api/src/routers`, registered in `routers/index.ts`) — implement the handler. Reuse `query-builder.ts` for ClickHouse reads; use Prisma (`@sbox-analytics/db`) for Postgres. Enforce auth/org context from the oRPC context.
3. **OpenAPI** — the project uses `@orpc/openapi`; ensure the route is reachable from the generated contract (renamed routes avoid ad-blockers — match the existing naming convention, see commit history).
4. **Web client** (`apps/web`) — consume via the typed oRPC client; integrate with TanStack Query for caching/loading/empty states (project already has skeletons + empty states).

## Rules

- Read an existing router + its web consumer first; mirror their patterns (error handling, pagination, date-range params).
- Analytics reads go through ClickHouse via `query-builder.ts` — do not inline raw SQL in routers.
- Reference the `hono` skill for server specifics and `vercel-react-best-practices` for the client side.
- New env var? Update root `.env.example` + `packages/env` zod schema (CLAUDE.md hard rule).
- Finish: `bun fix`, then `bun check-types` on the affected packages and report the result.
