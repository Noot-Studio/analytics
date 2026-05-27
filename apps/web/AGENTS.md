# `apps/web` — Dashboard (React + TanStack Router + Vite)

The customer-facing analytics dashboard. Renders DAU, session counts, retention, and the live event stream by calling `@sbox-analytics/api` through oRPC.

## Stack

- **Vite** dev server (`bun run dev:web`, port 5173).
- **TanStack Router** for type-safe file-based routing — routes live in `src/routes/`.
- **TanStack Query** + `@orpc/tanstack-query` — typed queries derived from the server router type.
- **Better Auth** client for sessions; auth state syncs with `apps/server`.
- **shadcn/ui primitives** from `@sbox-analytics/ui` — do not duplicate components locally.
- **Tailwind v4** via `@tailwindcss/vite`; tokens come from `@sbox-analytics/ui/globals.css`.

## Layout

```
src/
  main.tsx        # Vite entry
  router.tsx      # TanStack Router config
  routes/         # File-based routes
  components/     # App-specific composite components only
  lib/            # Client helpers (oRPC client, query client, etc.)
```

## Conventions

- Shared primitives live in `packages/ui`. Import as `@sbox-analytics/ui/components/button`. Add app-specific blocks here only when they aren't reusable.
- API types: import the **router type** from `@sbox-analytics/api`, never the implementation. The oRPC client provides full inference.
- Env vars must be prefixed `VITE_` and declared in `@sbox-analytics/env/web`.
- Follow the Ultracite + React rules in the root `CLAUDE.md` — no class components, hooks at top level, semantic HTML.

## Adding a feature

1. New oRPC procedure in `packages/api/src/routers/`.
2. New route under `src/routes/` consuming it via the typed client.
3. UI from `@sbox-analytics/ui`; add a shadcn primitive there if missing rather than reinventing it.
