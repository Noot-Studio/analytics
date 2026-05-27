# `packages/auth` — Better Auth Configuration

Single source of the Better Auth instance. `apps/server` mounts its handler; `packages/api` reads sessions from it; `apps/web` talks to it via the Better Auth client.

## Layout

```
src/index.ts   # createAuth() + exported `auth` singleton
src/steam.ts   # Steam Sign-In plugin (OpenID 2.0)
```

## Configuration highlights

- **Adapter**: Prisma (`@sbox-analytics/db`), provider `postgresql`.
- **Email/password**: enabled. Steam Sign-In is wired via the `steam()` plugin (OpenID 2.0 — `/sign-in/steam` + `/callback/steam`); other OAuth providers (e.g. Discord) go in the `plugins` array.
- **Steam**: requires `STEAM_API_KEY` (Steam Web API) in env. Synthesizes user email as `<steamid>@steam.local` (Steam never returns an email).
- **Cookies**: `httpOnly`, `sameSite: "none"`, `secure: true` — works across the dashboard subdomain and the API.
- **`trustedOrigins`**: pulled from `env.CORS_ORIGIN`. Add new dashboard origins here, not in `apps/server`.

## Conventions

- One `auth` instance per process. Import the singleton; don't call `createAuth()` again at call sites.
- Changes that touch the auth tables (User/Session/Account/Verification) must update `packages/db/prisma/schema/auth.prisma` and run `db:generate` + `db:push`.
- New plugins go in `plugins: []` — don't fork the file.
- Never read auth secrets from `process.env` directly — go through `@sbox-analytics/env/server`.

## Out of scope

- HTTP handler mounting — that's `apps/server`.
- The C# SDK's API-key auth — that's a separate scheme handled by `apps/ingest` (Postgres `api_key` lookup), unrelated to Better Auth.
