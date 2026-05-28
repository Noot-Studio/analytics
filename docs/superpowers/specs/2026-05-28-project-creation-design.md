# Project Creation & API Key Restructure Design

## Date: 2026-05-28

## Overview

Introduce proper project creation so s&box developers can organize analytics by game. Restructure API keys to belong to projects (not organizations) and update the schema so projects are owned by organizations.

## Goals

- Let users create, list, and delete projects within their organization
- Move API keys from organization-level to project-level
- Update ingest service to resolve keys to project IDs
- Maintain existing auth flow (Better Auth + organization membership)

## Schema Changes

### `project.prisma` — Updated

```prisma
model Project {
  id             String       @id @default(cuid())
  slug           String
  name           String
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  apiKeys ApiKey[]

  @@unique([organizationId, slug])
  @@index([organizationId])
  @@map("project")
}

model ApiKey {
  id             String   @id @default(cuid())
  projectId      String
  project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name           String
  publishableKey String   @unique
  secretHash     String
  revokedAt      DateTime?
  lastUsedAt     DateTime?
  createdAt      DateTime @default(now())

  @@index([projectId])
  @@map("api_key")
}
```

### `auth.prisma` — Minor Update

Add `projects` relation to `Organization`:

```prisma
model Organization {
  id          String    @id
  name        String
  slug        String    @unique
  logo        String?
  metadata    String?
  createdAt   DateTime  @default(now())

  members     Member[]
  invitations Invitation[]
  projects    Project[]

  @@map("organization")
}
```

User, Member, Session, Account, Verification remain unchanged.

### Key Changes

| Before | After |
|--------|-------|
| `Project.ownerId` | `Project.organizationId` (org owns project) |
| `ApiKey.organizationId` | `ApiKey.projectId` (keys belong to projects) |
| Project has no `name` | Project gains `name` field |
| Project has no `apiKeys` relation | Project gains `apiKeys` relation |

## API Endpoints

### New: `projects` Router

```typescript
// POST /rpc/projects.create
{
  "name": "Sbox Shooter",
  "slug": "sbox-shooter" // optional, auto-generated from name
}

// Response
{
  "id": "proj_abc123",
  "name": "Sbox Shooter",
  "slug": "sbox-shooter",
  "organizationId": "org_xyz",
  "createdAt": "2026-05-28T10:00:00Z"
}

// GET /rpc/projects.list
// Lists all projects in the active organization
// Response: array of projects

// GET /rpc/projects.get
// Input: { "id": "proj_abc123" }
// Response: single project with apiKeys count

// DELETE /rpc/projects.delete
// Input: { "id": "proj_abc123" }
// Cascades: deletes all apiKeys, events remain in ClickHouse (orphaned but queryable)
```

### Updated: `apiKeys` Router

Keys now belong to projects, not organizations:

```typescript
// POST /rpc/apiKeys.create
{
  "projectId": "proj_abc123", // Required
  "name": "Production SDK"
}

// Response
{
  "id": "key_abc",
  "name": "Production SDK",
  "publishableKey": "pk_...",
  "secretKey": "sk_...",
  "createdAt": "2026-05-28T10:00:00Z"
}

// GET /rpc/apiKeys.list
// Input: { "projectId": "proj_abc123" } // Required filter
// Response: keys for that project only

// DELETE /rpc/apiKeys.revoke — unchanged signature
// PUT /rpc/apiKeys.rotate — unchanged signature
```

### Slug Validation

- Auto-generated from name if not provided
- Format: `a-z0-9-` only, max 64 chars
- Uniqueness scoped to organization (two orgs can have same slug)
- Converted to lowercase, spaces replaced with hyphens

## Authorization

### Reusable Helpers

```typescript
// assertOrgMembership(userId, organizationId, minRole?)
async function assertOrgMembership(
  userId: string,
  organizationId: string,
  minRole: "owner" | "admin" = "admin"
): Promise<void>

// assertProjectAccess(userId, projectId)
// Verifies user has access to the project via org membership
// Returns: organizationId
async function assertProjectAccess(
  userId: string,
  projectId: string
): Promise<string>
```

### Endpoint Permissions

| Endpoint | Required Role |
|----------|--------------|
| `projects.create` | Member (any role) |
| `projects.list` | Member (any role) |
| `projects.get` | Member (any role) |
| `projects.delete` | Owner or Admin |
| `apiKeys.create` | Member (any role) |
| `apiKeys.list` | Member (any role) |
| `apiKeys.revoke` | Member (any role) |
| `apiKeys.rotate` | Member (any role) |

### Data Flow

**`projects.create`:**
1. Get `activeOrganizationId` from session
2. `assertOrgMembership(userId, organizationId)`
3. Validate slug (unique within org)
4. Create `Project` with `organizationId`
5. Return project

**`apiKeys.create`:**
1. Validate `projectId` exists
2. `assertProjectAccess(userId, projectId)` → verifies org membership
3. Generate key pair (publishable + secret)
4. Create `ApiKey` with `projectId`
5. Return key pair (secret shown once)

**`analytics.query` (from custom analytics spec):**
1. `assertProjectAccess(userId, projectId)`
2. Execute ClickHouse query
3. Return results

## Ingest Service Updates

### `apps/ingest/src/keys.ts`

Change the Prisma query from:
```typescript
prisma.apiKey.findFirst({
  select: { projectId: true },
  where: { publishableKey, revokedAt: null },
})
```

To match the new schema (which now has `projectId` directly on ApiKey, so this actually works without change — just the schema relation changes).

**Note:** The ingest service already queries `apiKey.projectId`. With the schema change, `projectId` will exist on ApiKey directly, so the query remains valid.

## Files to Update

1. `packages/db/prisma/schema/project.prisma` — New schema
2. `packages/api/src/routers/projects.ts` — New router
3. `packages/api/src/routers/api-keys.ts` — Use `projectId` instead of `organizationId`
4. `packages/api/src/routers/index.ts` — Register `projects` router
5. `packages/api/src/routers/analytics.ts` — Update `assertProjectOwnership` to use new schema
6. `apps/ingest/src/keys.ts` — Verify query still works with new schema

## Migration Strategy

**This is a breaking change.** Existing data in Postgres will be invalid.

**Steps:**
1. Stop all services (`Ctrl+C` on dev processes)
2. `bun run db:down` (destroy volumes)
3. Update Prisma schema files
4. `bun run db:start` (fresh containers)
5. `bun run db:push`
6. `bun run db:generate`
7. Restart services

## Error Handling

| Status | Trigger |
|--------|---------|
| `400` | Invalid slug format, duplicate slug in org |
| `403` | Not a member of the organization, insufficient role |
| `404` | Project not found |
| `409` | Project slug already exists in organization |

## Out of Scope

- Project editing (name/slug changes) — can be added later
- Project archiving — soft delete not needed yet
- Project transfer between organizations — future feature
- API key permissions per-project — all members have equal access
- Project-level member roles — use org-level roles only

## Future Enhancements

- Project templates (pre-configured event types)
- Project-level settings (timezone, data retention)
- Project archiving instead of deletion
- API key scoped permissions (read-only vs write)

## References

- [Custom Analytics Query API Design](./2026-05-28-custom-analytics-api-design.md)
- [Prisma Relations](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations)
- [Better Auth Organization Plugin](https://www.better-auth.com/docs/plugins/organization)
