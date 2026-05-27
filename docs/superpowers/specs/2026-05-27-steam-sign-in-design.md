# Steam Sign-In — Backend Design

**Date**: 2026-05-27
**Package**: `packages/auth`
**Status**: Approved

## Goal

Enable Sign In with Steam by adding a Better Auth plugin. Backend only; the
frontend integration (`apps/web`) is a follow-up.

## Constraints

- Steam uses **OpenID 2.0**, not OAuth 2.0 — Better Auth's built-in OAuth
  providers and `genericOAuth` plugin cannot be reused.
- `AGENTS.md` rule: new providers must be Better Auth plugins added to the
  existing `plugins: []` array, not forks of the singleton.
- No changes to `packages/db/prisma/schema/auth.prisma` — the existing
  `Account(providerId, accountId)` shape is sufficient.

## Surface

Two endpoints under the Better Auth handler:

1. `GET /sign-in/steam?callbackURL=<url>`
2. `GET /callback/steam` (Steam's `openid.return_to`)

Plugin id: `"steam"`. Account `providerId`: `"steam"`. Account `accountId`:
SteamID64 (17-digit numeric string).

## Configuration

- New env var in `packages/env/src/server.ts`:
  `STEAM_API_KEY: z.string().min(1)` (Steam Web API key, required).
- Plugin reads `BETTER_AUTH_URL` to build `openid.return_to`.

## Flow

### `/sign-in/steam`

1. Read `callbackURL` query param. Validate against `trustedOrigins`; reject
   with 400 if it doesn't match.
2. Generate a random nonce (32 bytes, base64url).
3. Set a signed, short-lived (`Max-Age=600`) HTTP-only cookie
   `steam_oauth_state` whose value encodes `{ nonce, callbackURL }`. Signed
   with `BETTER_AUTH_SECRET` (HMAC-SHA256) to prevent tampering.
4. Build the Steam OpenID URL with:
   - `openid.ns = http://specs.openid.net/auth/2.0`
   - `openid.mode = checkid_setup`
   - `openid.return_to = <BETTER_AUTH_URL>/callback/steam`
   - `openid.realm = <BETTER_AUTH_URL>`
   - `openid.identity = openid.claim_id =
http://specs.openid.net/auth/2.0/identifier_select`
5. 302 redirect to `https://steamcommunity.com/openid/login?<params>`.

### `/callback/steam`

1. Read and clear `steam_oauth_state` cookie. Verify signature; reject if
   missing/invalid.
2. Verify the OpenID assertion: take all incoming `openid.*` params, set
   `openid.mode=check_authentication`, POST as `application/x-www-form-urlencoded`
   to `https://steamcommunity.com/openid/login`. Body must contain
   `is_valid:true`. Reject otherwise.
3. Extract SteamID from `openid.claimed_id` using the regex
   `^https://steamcommunity\.com/openid/id/(\d{17})$`. Reject if no match.
4. Fetch profile from
   `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=<STEAM_API_KEY>&steamids=<steamid>`.
   Read `response.players[0].personaname` and `avatarfull`. If the call fails,
   fall back to using the SteamID as the name and no avatar — sign-in must not
   be blocked by a Steam Web API outage.
5. Account upsert via `ctx.context.internalAdapter`:
   - `findAccount({ providerId: "steam", accountId: steamId })` → if hit, load
     its User.
   - Else `createUser({ email: "<steamid>@steam.local", name, image,
emailVerified: false })` then `createAccount({ providerId: "steam",
accountId: steamId, userId })`.
6. `createSession({ userId, ipAddress, userAgent })`.
7. Set session cookie via the standard Better Auth helper so cookie attributes
   inherit the package's `httpOnly / sameSite=none / secure` defaults.
8. 302 redirect to the `callbackURL` recovered from the state cookie.

## Security

- **CSRF/replay**: signed state cookie ties the redirect to the originating
  browser; mismatched or missing cookie aborts the callback.
- **Open-redirect**: `callbackURL` is validated against `trustedOrigins`
  before the state cookie is set.
- **Trust boundary**: the OpenID `check_authentication` POST is the only
  source of truth that the user really controls the Steam account. We never
  trust the redirect params alone.
- **Issuer pinning**: regex on `claimed_id` rejects any value that isn't a
  steamcommunity.com OpenID identifier.

## Linking behavior

Standard Better Auth: first lookup by `(providerId, accountId)`; on miss,
create a fresh User row using the synthetic `<steamid>@steam.local` email.
Because that email is unique-per-SteamID, Steam accounts are effectively
isolated from password accounts. An explicit "link Steam to existing account"
flow is out of scope for this spec.

## Files touched

- `packages/auth/src/steam.ts` — new plugin.
- `packages/auth/src/index.ts` — add `steam()` to `plugins`.
- `packages/env/src/server.ts` — add `STEAM_API_KEY`.
- `packages/auth/AGENTS.md` — update the Steam reference from "planned" to
  "implemented" and document the env var.

## Out of scope

- Frontend client integration (`apps/web`).
- Server route mounting (`apps/server` already mounts the Better Auth handler).
- "Link Steam to my existing email/password account" UX.
- Steam profile refresh on subsequent sign-ins beyond what GetPlayerSummaries
  returns at sign-in time.
