# API Keys Feature Design

**Date:** 2026-05-28  
**Status:** Approved

## Overview

Add an API Keys section to the Organization Settings page (`/dashboard/organization`). API key pairs (public + secret) allow a user's game to authenticate against the Ingest API to register events. Keys are scoped to an Organization, named by the user, and support creation, rotation, and revocation.

---

## Data Layer

### Schema changes (`packages/db/prisma/schema/project.prisma`)

The existing `ApiKey` model is re-scoped from `Project` to `Organization`. The `Project` model loses its `apiKeys` relation but is otherwise unchanged (still used by the analytics router).

```prisma
model ApiKey {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name           String
  publishableKey String       @unique  // prefix: pk_
  secretHash     String               // bcrypt hash of sk_<cuid>
  revokedAt      DateTime?
  lastUsedAt     DateTime?
  createdAt      DateTime     @default(now())

  @@index([organizationId])
  @@map("api_key")
}
```

The `Organization` model (managed by Better Auth in `auth.prisma`) gains an `apiKeys ApiKey[]` relation field.

### Key generation

- `publishableKey`: `pk_<cuid()>` — safe to expose in game clients
- `secretKey`: `sk_<cuid()>` — plaintext returned once at creation/rotation, never stored
- `secretHash`: `bcrypt(secretKey, cost=10)` — stored for Ingest API verification

---

## API Layer

New router: `packages/api/src/routers/api-keys.ts`  
Wired into `appRouter` as `apiKeys`.

All procedures use `protectedProcedure`. Active organization is resolved from `context.session.session.activeOrganizationId`. Missing active org throws `FORBIDDEN`.

### Procedures

| Procedure        | Input              | Returns                                                            | Notes                                    |
| ---------------- | ------------------ | ------------------------------------------------------------------ | ---------------------------------------- |
| `apiKeys.list`   | —                  | `{ id, name, publishableKey, createdAt, lastUsedAt, revokedAt }[]` | Never returns `secretHash`               |
| `apiKeys.create` | `{ name: string }` | `{ id, name, publishableKey, secretKey }`                          | `secretKey` is one-time plaintext        |
| `apiKeys.rotate` | `{ id: string }`   | `{ publishableKey, secretKey }`                                    | Generates new pair, updates row in-place |
| `apiKeys.revoke` | `{ id: string }`   | `{ id }`                                                           | Sets `revokedAt = now()`                 |

All mutating procedures verify the target key belongs to the active org before acting.

---

## UI Layer

### Location

Section appended to `/dashboard/organization` (`apps/web/src/routes/dashboard/organization.tsx`).

### New components

| File                                                          | Purpose                                      |
| ------------------------------------------------------------- | -------------------------------------------- |
| `apps/web/src/components/dashboard/api-keys-section.tsx`      | Full section: table, query, mutation wiring  |
| `apps/web/src/components/dashboard/create-api-key-dialog.tsx` | Create flow + one-time secret reveal         |
| `apps/web/src/components/dashboard/rotate-api-key-dialog.tsx` | Rotate confirmation + one-time secret reveal |
| `apps/web/src/components/dashboard/revoke-api-key-dialog.tsx` | Revoke confirmation                          |

### Table columns

Name | Public Key (monospace, truncated, copy icon) | Created | Last Used | Status (Active / Revoked badge) | Actions

### Flows

**Create:**

1. "Create API Key" button opens `CreateApiKeyDialog` with a `name` input.
2. On success the dialog content swaps to a one-time secret reveal showing `publishableKey` and `secretKey` in monospace copy-able fields, with a warning: "This secret will not be shown again."
3. "Done" closes the dialog and the table refetches.

**Rotate:**

1. "Rotate" row action opens `RotateApiKeyDialog` with a confirmation message.
2. On confirm the same one-time secret reveal appears with the new pair.
3. "Done" closes the dialog and the table refetches.

**Revoke:**

1. "Revoke" row action opens `RevokeApiKeyDialog` with a confirmation message.
2. On confirm `revokedAt` is set; the row shows a "Revoked" badge and the Rotate/Revoke actions are removed.

### Data fetching

Uses `useQuery` / `useMutation` via the existing oRPC client (`utils/orpc.ts` pattern), consistent with the analytics route.

---

## Out of Scope

- Per-key permissions or scopes
- Key expiry dates
- Ingest API verification logic (separate concern)
- Showing revoked keys in the table (filtered out by default)
