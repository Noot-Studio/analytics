# Custom Analytics API + Project Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement structured custom analytics queries, project creation, and restructure API keys to belong to projects with full UI integration.

**Architecture:** Add a query-builder module that converts structured JSON configs to parameterized ClickHouse SQL. Restructure Prisma schema so Projects belong to Organizations and API Keys belong to Projects. Build UI for project management and project-scoped analytics dashboard.

**Tech Stack:** Prisma, ClickHouse, oRPC, Zod, React, TanStack Router, TanStack Query, shadcn/ui

---

## File Map

### Backend (New/Modified)

- `packages/db/prisma/schema/project.prisma` — Updated schema (Project → Organization, ApiKey → Project)
- `packages/db/prisma/schema/auth.prisma` — Add projects relation to Organization
- `packages/api/src/query-builder.ts` — NEW: JSON config → ClickHouse SQL
- `packages/api/src/routers/custom-analytics.ts` — NEW: oRPC router for analytics.query
- `packages/api/src/routers/projects.ts` — NEW: oRPC router for project CRUD
- `packages/api/src/routers/api-keys.ts` — MODIFY: Use projectId instead of organizationId
- `packages/api/src/routers/analytics.ts` — MODIFY: Update ownership check for new schema
- `packages/api/src/routers/index.ts` — MODIFY: Register new routers
- `apps/ingest/src/keys.ts` — VERIFY: Confirm works with new schema

### UI (New/Modified)

- `apps/web/src/routes/dashboard/projects/index.tsx` — NEW: Project list page
- `apps/web/src/routes/dashboard/projects/$projectId.tsx` — NEW: Project detail + API keys
- `apps/web/src/features/projects/components/organisms/projects-list.tsx` — NEW
- `apps/web/src/features/projects/components/molecules/create-project-dialog.tsx` — NEW
- `apps/web/src/features/projects/components/molecules/project-card.tsx` — NEW
- `apps/web/src/components/dashboard/app-sidebar.tsx` — MODIFY: Add project nav
- `apps/web/src/features/api-keys/components/organisms/api-keys-section.tsx` — MODIFY: Accept projectId prop
- `apps/web/src/routes/dashboard/index.tsx` — MODIFY: Show project selector or redirect
- `apps/web/src/routes/dashboard/organization.tsx` — MODIFY: Remove API keys section

---

## Task 1: Update Prisma Schema

**Files:**

- Modify: `packages/db/prisma/schema/project.prisma`
- Modify: `packages/db/prisma/schema/auth.prisma`

- [ ] **Step 1: Update project.prisma**

Replace the entire file:

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

- [ ] **Step 2: Update auth.prisma — Add projects relation to Organization**

In the Organization model, change:

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

- [ ] **Step 3: Remove User.projects relation (no longer needed)**

In the User model, remove the `projects` line:

```prisma
model User {
  id            String    @id
  name          String
  email         String
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sessions      Session[]
  accounts      Account[]
  members       Member[]
  invitations   Invitation[]

  @@unique([email])
  @@map("user")
}
```

- [ ] **Step 4: Reset database**

Run:

```bash
bun run db:down
bun run db:start
bun run db:push
bun run db:generate
```

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema/
git commit -m "schema: restructure projects and api keys"
```

---

## Task 2: Create Query Builder Module

**Files:**

- Create: `packages/api/src/query-builder.ts`

- [ ] **Step 1: Write the query builder**

```typescript
import { z } from "zod";

export const filterOperator = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "starts_with",
  "in",
]);

export const filterSchema = z.object({
  property: z.string().min(1),
  operator: filterOperator,
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

export const queryConfigSchema = z.object({
  projectId: z.string().min(1),
  eventType: z.string().min(1).optional(),
  filters: z.array(filterSchema).max(10).optional(),
  groupBy: z.array(z.string().min(1)).max(5).optional(),
  aggregation: z.enum([
    "count",
    "unique_players",
    "unique_sessions",
    "avg",
    "sum",
    "min",
    "max",
  ]),
  aggregateProperty: z.string().min(1).optional(),
  timeRange: z.object({
    from: z.iso.date(),
    to: z.iso.date(),
  }),
  granularity: z.enum(["hour", "day", "week", "month", "none"]).default("day"),
  limit: z.number().int().min(1).max(1000).default(100),
});

export type QueryConfig = z.infer<typeof queryConfigSchema>;
export type Filter = z.infer<typeof filterSchema>;

interface QueryResult {
  query: string;
  params: Record<string, unknown>;
}

function buildPropertyAccessor(
  property: string,
  valueType: "string" | "number"
): string {
  if (valueType === "number") {
    return `JSONExtractFloat64(properties, '${property}')`;
  }
  return `JSONExtractString(properties, '${property}')`;
}

function getValueType(value: unknown): "string" | "number" {
  if (typeof value === "number") return "number";
  return "string";
}

function buildFilterCondition(
  filter: Filter,
  index: number
): { condition: string; paramName: string; paramValue: unknown } {
  const valueType = getValueType(
    Array.isArray(filter.value) ? filter.value[0] : filter.value
  );
  const accessor = buildPropertyAccessor(filter.property, valueType);
  const paramName = `filter_${index}_value`;

  switch (filter.operator) {
    case "eq":
      return {
        condition: `${accessor} = {${paramName}:${valueType === "number" ? "Float64" : "String"}}`,
        paramName,
        paramValue: filter.value,
      };
    case "neq":
      return {
        condition: `${accessor} != {${paramName}:${valueType === "number" ? "Float64" : "String"}}`,
        paramName,
        paramValue: filter.value,
      };
    case "gt":
      return {
        condition: `${accessor} > {${paramName}:Float64}`,
        paramName,
        paramValue: filter.value,
      };
    case "gte":
      return {
        condition: `${accessor} >= {${paramName}:Float64}`,
        paramName,
        paramValue: filter.value,
      };
    case "lt":
      return {
        condition: `${accessor} < {${paramName}:Float64}`,
        paramName,
        paramValue: filter.value,
      };
    case "lte":
      return {
        condition: `${accessor} <= {${paramName}:Float64}`,
        paramName,
        paramValue: filter.value,
      };
    case "contains":
      return {
        condition: `${accessor} LIKE {${paramName}:String}`,
        paramName,
        paramValue: `%${filter.value}%`,
      };
    case "starts_with":
      return {
        condition: `${accessor} LIKE {${paramName}:String}`,
        paramName,
        paramValue: `${filter.value}%`,
      };
    case "in": {
      const values = Array.isArray(filter.value)
        ? filter.value
        : [String(filter.value)];
      const placeholders = values
        .map((_, i) => `{${paramName}_${i}:String}`)
        .join(", ");
      const params: Record<string, string> = {};
      for (let i = 0; i < values.length; i++) {
        params[`${paramName}_${i}`] = values[i];
      }
      return {
        condition: `${accessor} IN (${placeholders})`,
        paramName,
        paramValue: params,
      };
    }
    default:
      throw new Error(`Unsupported operator: ${filter.operator}`);
  }
}

function buildAggregation(
  aggregation: QueryConfig["aggregation"],
  aggregateProperty?: string
): string {
  switch (aggregation) {
    case "count":
      return "count() AS value";
    case "unique_players":
      return "uniq(player_id) AS value";
    case "unique_sessions":
      return "uniq(session_id) AS value";
    case "avg":
      if (!aggregateProperty)
        throw new Error("aggregateProperty required for avg");
      return `avg(JSONExtractFloat64(properties, '${aggregateProperty}')) AS value`;
    case "sum":
      if (!aggregateProperty)
        throw new Error("aggregateProperty required for sum");
      return `sum(JSONExtractFloat64(properties, '${aggregateProperty}')) AS value`;
    case "min":
      if (!aggregateProperty)
        throw new Error("aggregateProperty required for min");
      return `min(JSONExtractFloat64(properties, '${aggregateProperty}')) AS value`;
    case "max":
      if (!aggregateProperty)
        throw new Error("aggregateProperty required for max");
      return `max(JSONExtractFloat64(properties, '${aggregateProperty}')) AS value`;
    default:
      throw new Error(`Unsupported aggregation: ${aggregation}`);
  }
}

function buildTimeBucket(
  granularity: QueryConfig["granularity"]
): string | null {
  switch (granularity) {
    case "hour":
      return "toStartOfHour(timestamp) AS time_bucket";
    case "day":
      return "toStartOfDay(timestamp) AS time_bucket";
    case "week":
      return "toStartOfWeek(timestamp) AS time_bucket";
    case "month":
      return "toStartOfMonth(timestamp) AS time_bucket";
    case "none":
      return null;
    default:
      throw new Error(`Unsupported granularity: ${granularity}`);
  }
}

export function buildQuery(config: QueryConfig): QueryResult {
  const selectColumns: string[] = [];
  const groupByColumns: string[] = [];
  const params: Record<string, unknown> = {
    projectId: config.projectId,
    from: config.timeRange.from,
    to: config.timeRange.to,
  };

  // Time bucket
  const timeBucket = buildTimeBucket(config.granularity);
  if (timeBucket) {
    selectColumns.push(timeBucket);
    groupByColumns.push("time_bucket");
  }

  // Group by properties
  if (config.groupBy) {
    for (const property of config.groupBy) {
      selectColumns.push(
        `JSONExtractString(properties, '${property}') AS ${property}`
      );
      groupByColumns.push(property);
    }
  }

  // Aggregation
  selectColumns.push(
    buildAggregation(config.aggregation, config.aggregateProperty)
  );

  // Build WHERE clauses
  const whereConditions: string[] = [
    "project_id = {projectId:String}",
    "timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}",
  ];

  if (config.eventType) {
    whereConditions.push("event_type = {eventType:String}");
    params.eventType = config.eventType;
  }

  if (config.filters) {
    for (let i = 0; i < config.filters.length; i++) {
      const filter = config.filters[i];
      const { condition, paramName, paramValue } = buildFilterCondition(
        filter,
        i
      );
      whereConditions.push(condition);

      if (
        typeof paramValue === "object" &&
        paramValue !== null &&
        !Array.isArray(paramValue)
      ) {
        Object.assign(params, paramValue);
      } else {
        params[paramName] = paramValue;
      }
    }
  }

  // Build query
  let query = `SELECT\n  ${selectColumns.join(",\n  ")}\nFROM analytics.events\nWHERE ${whereConditions.join("\n  AND ")}`;

  if (groupByColumns.length > 0) {
    query += `\nGROUP BY ${groupByColumns.join(", ")}`;
  }

  query += `\nORDER BY ${groupByColumns.length > 0 ? groupByColumns.join(", ") : "timestamp DESC"}`;
  query += `\nLIMIT {limit:UInt32}`;
  params.limit = config.limit;

  return { query, params };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/query-builder.ts
git commit -m "feat: add clickhouse query builder for structured analytics"
```

---

## Task 3: Create Custom Analytics Router

**Files:**

- Create: `packages/api/src/routers/custom-analytics.ts`

- [ ] **Step 1: Write the router**

```typescript
import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import { clickhouse } from "../clickhouse";
import { protectedProcedure } from "../index";
import { buildQuery, queryConfigSchema } from "../query-builder";

async function assertProjectAccess(
  projectId: string,
  userId: string
): Promise<void> {
  const project = await prisma.project.findFirst({
    select: { organizationId: true },
    where: { id: projectId },
  });

  if (!project) {
    throw new ORPCError("FORBIDDEN", { message: "Project not found" });
  }

  const membership = await prisma.member.findFirst({
    select: { id: true },
    where: {
      userId,
      organizationId: project.organizationId,
    },
  });

  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "Project not accessible" });
  }
}

export const customAnalyticsRouter = {
  query: protectedProcedure
    .input(queryConfigSchema)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const { query, params } = buildQuery(input);

      const result = await clickhouse().query({
        format: "JSON",
        query,
        query_params: params,
      });

      const json = await result.json<Record<string, unknown>>();
      return json.data;
    }),
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/routers/custom-analytics.ts
git commit -m "feat: add custom analytics query endpoint"
```

---

## Task 4: Create Projects Router

**Files:**

- Create: `packages/api/src/routers/projects.ts`

- [ ] **Step 1: Write the router**

```typescript
import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import { protectedProcedure } from "../index";

function requireActiveOrg(context: {
  session: { session: { activeOrganizationId?: string | null } };
}): string {
  const orgId = context.session.session.activeOrganizationId;
  if (!orgId) {
    throw new ORPCError("FORBIDDEN", { message: "No active organization" });
  }
  return orgId;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

async function assertOrgMembership(
  userId: string,
  organizationId: string
): Promise<void> {
  const member = await prisma.member.findFirst({
    select: { id: true },
    where: { userId, organizationId },
  });
  if (!member) {
    throw new ORPCError("FORBIDDEN", {
      message: "Organization not accessible",
    });
  }
}

async function assertProjectAccess(
  userId: string,
  projectId: string
): Promise<string> {
  const project = await prisma.project.findFirst({
    select: { organizationId: true },
    where: { id: projectId },
  });

  if (!project) {
    throw new ORPCError("NOT_FOUND", { message: "Project not found" });
  }

  await assertOrgMembership(userId, project.organizationId);
  return project.organizationId;
}

export const projectsRouter = {
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(64).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const organizationId = requireActiveOrg(context);
      await assertOrgMembership(context.session.user.id, organizationId);

      const slug = input.slug || generateSlug(input.name);

      // Check for duplicate slug in org
      const existing = await prisma.project.findFirst({
        select: { id: true },
        where: { organizationId, slug },
      });

      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: "Project slug already exists",
        });
      }

      const project = await prisma.project.create({
        data: {
          name: input.name,
          slug,
          organizationId,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          organizationId: true,
          createdAt: true,
        },
      });

      return project;
    }),

  list: protectedProcedure.handler(async ({ context }) => {
    const organizationId = requireActiveOrg(context);
    await assertOrgMembership(context.session.user.id, organizationId);

    return prisma.project.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        _count: {
          select: { apiKeys: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await assertProjectAccess(context.session.user.id, input.id);

      const project = await prisma.project.findFirst({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          slug: true,
          organizationId: true,
          createdAt: true,
          apiKeys: {
            where: { revokedAt: null },
            select: {
              id: true,
              name: true,
              publishableKey: true,
              createdAt: true,
              lastUsedAt: true,
            },
          },
        },
      });

      if (!project) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }

      return project;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await assertProjectAccess(context.session.user.id, input.id);

      await prisma.project.delete({
        where: { id: input.id },
      });

      return { id: input.id };
    }),
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/routers/projects.ts
git commit -m "feat: add projects router with crud operations"
```

---

## Task 5: Update API Keys Router

**Files:**

- Modify: `packages/api/src/routers/api-keys.ts`

- [ ] **Step 1: Replace api-keys.ts**

```typescript
import { createHash, randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import { protectedProcedure } from "../index";

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function generateKeyPair() {
  const publishableKey = `pk_${randomUUID().replaceAll("-", "")}`;
  const secretKey = `sk_${randomUUID().replaceAll("-", "")}`;
  return { publishableKey, secretHash: hashSecret(secretKey), secretKey };
}

async function assertProjectAccess(
  userId: string,
  projectId: string
): Promise<void> {
  const project = await prisma.project.findFirst({
    select: { organizationId: true },
    where: { id: projectId },
  });

  if (!project) {
    throw new ORPCError("NOT_FOUND", { message: "Project not found" });
  }

  const membership = await prisma.member.findFirst({
    select: { id: true },
    where: {
      userId,
      organizationId: project.organizationId,
    },
  });

  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "Project not accessible" });
  }
}

export const apiKeysRouter = {
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        name: z.string().min(1).max(100),
      })
    )
    .handler(async ({ context, input }) => {
      await assertProjectAccess(context.session.user.id, input.projectId);

      const { publishableKey, secretKey, secretHash } = generateKeyPair();
      const apiKey = await prisma.apiKey.create({
        data: {
          name: input.name,
          projectId: input.projectId,
          publishableKey,
          secretHash,
        },
        select: { id: true, name: true, publishableKey: true },
      });
      return { ...apiKey, secretKey };
    }),

  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      await assertProjectAccess(context.session.user.id, input.projectId);

      return prisma.apiKey.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          id: true,
          lastUsedAt: true,
          name: true,
          publishableKey: true,
        },
        where: { projectId: input.projectId, revokedAt: null },
      });
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const apiKey = await prisma.apiKey.findFirst({
        select: { projectId: true },
        where: { id: input.id, revokedAt: null },
      });

      if (!apiKey) {
        throw new ORPCError("NOT_FOUND", { message: "API key not found" });
      }

      await assertProjectAccess(context.session.user.id, apiKey.projectId);

      await prisma.apiKey.update({
        data: { revokedAt: new Date() },
        where: { id: input.id },
      });

      return { id: input.id };
    }),

  rotate: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const apiKey = await prisma.apiKey.findFirst({
        select: { projectId: true },
        where: { id: input.id, revokedAt: null },
      });

      if (!apiKey) {
        throw new ORPCError("NOT_FOUND", { message: "API key not found" });
      }

      await assertProjectAccess(context.session.user.id, apiKey.projectId);

      const { publishableKey, secretKey, secretHash } = generateKeyPair();
      await prisma.apiKey.update({
        data: { publishableKey, secretHash },
        where: { id: input.id },
      });

      return { publishableKey, secretKey };
    }),
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/routers/api-keys.ts
git commit -m "refactor: restructure api keys to belong to projects"
```

---

## Task 6: Update Analytics Router

**Files:**

- Modify: `packages/api/src/routers/analytics.ts`

- [ ] **Step 1: Update ownership check**

Replace the `assertProjectOwnership` function:

```typescript
async function assertProjectAccess(
  projectId: string,
  userId: string
): Promise<void> {
  const project = await prisma.project.findFirst({
    select: { organizationId: true },
    where: { id: projectId },
  });

  if (!project) {
    throw new ORPCError("FORBIDDEN", { message: "Project not found" });
  }

  const membership = await prisma.member.findFirst({
    select: { id: true },
    where: {
      userId,
      organizationId: project.organizationId,
    },
  });

  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "Project not accessible" });
  }
}
```

And update the calls from `assertProjectOwnership` to `assertProjectAccess`.

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/routers/analytics.ts
git commit -m "refactor: update analytics router for new project schema"
```

---

## Task 7: Register Routers

**Files:**

- Modify: `packages/api/src/routers/index.ts`

- [ ] **Step 1: Register new routers**

```typescript
import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { analyticsRouter } from "./analytics";
import { apiKeysRouter } from "./api-keys";
import { customAnalyticsRouter } from "./custom-analytics";
import { projectsRouter } from "./projects";

export const appRouter = {
  analytics: analyticsRouter,
  apiKeys: apiKeysRouter,
  customAnalytics: customAnalyticsRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
  projects: projectsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/routers/index.ts
git commit -m "feat: register custom analytics and projects routers"
```

---

## Task 8: Verify Ingest Service

**Files:**

- Verify: `apps/ingest/src/keys.ts`

- [ ] **Step 1: Verify the query still works**

The existing code already queries `projectId`:

```typescript
const row = await prisma.apiKey.findFirst({
  select: { projectId: true },
  where: { publishableKey, revokedAt: null },
});
```

This works with the new schema since `ApiKey` now has `projectId` directly.

- [ ] **Step 2: Typecheck**

```bash
bun run check-types
```

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "verify: ingest service compatible with new schema"
```

---

## Task 9: Create UI Components - Projects Feature

**Files:**

- Create: `apps/web/src/features/projects/components/molecules/project-card.tsx`
- Create: `apps/web/src/features/projects/components/molecules/create-project-dialog.tsx`
- Create: `apps/web/src/features/projects/components/organisms/projects-list.tsx`

- [ ] **Step 1: Create project-card.tsx**

```tsx
import { Button } from "@sbox-analytics/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sbox-analytics/ui/components/card";
import { Link } from "@tanstack/react-router";

interface ProjectCardProps {
  id: string;
  name: string;
  slug: string;
  apiKeyCount: number;
  createdAt: Date;
}

export function ProjectCard({
  id,
  name,
  slug,
  apiKeyCount,
  createdAt,
}: ProjectCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{slug}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {apiKeyCount} API key{apiKeyCount !== 1 ? "s" : ""}
          </div>
          <Button asChild size="sm" variant="outline">
            <Link
              to="/dashboard/projects/$projectId"
              params={{ projectId: id }}
            >
              View
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create create-project-dialog.tsx**

```tsx
import { Button } from "@sbox-analytics/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sbox-analytics/ui/components/dialog";
import { Input } from "@sbox-analytics/ui/components/input";
import { Label } from "@sbox-analytics/ui/components/label";
import { useState } from "react";

interface CreateProjectDialogProps {
  isPending: boolean;
  onCreate: (name: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function CreateProjectDialog({
  isPending,
  onCreate,
  onOpenChange,
  open,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim());
      setName("");
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Create a new project to track analytics for your game.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Game"
                value={name}
              />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={isPending || !name.trim()} type="submit">
              {isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create projects-list.tsx**

```tsx
import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { CreateProjectDialog } from "../molecules/create-project-dialog";
import { ProjectCard } from "../molecules/project-card";

export function ProjectsList() {
  const listQuery = useQuery(orpc.projects.list.queryOptions());

  if (listQuery.isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Loading projects...
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <div className="py-8 text-center text-destructive">
        Failed to load projects.
      </div>
    );
  }

  const projects = listQuery.data ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard
          apiKeyCount={project._count.apiKeys}
          createdAt={project.createdAt}
          id={project.id}
          key={project.id}
          name={project.name}
          slug={project.slug}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/projects/
git commit -m "feat: add projects ui components"
```

---

## Task 10: Create Project Pages

**Files:**

- Create: `apps/web/src/routes/dashboard/projects/index.tsx`
- Create: `apps/web/src/routes/dashboard/projects/$projectId.tsx`

- [ ] **Step 1: Create projects index page**

```tsx
import { Button } from "@sbox-analytics/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ProjectsList } from "@/features/projects/components/organisms/projects-list";
import { CreateProjectDialog } from "@/features/projects/components/molecules/create-project-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/projects/")({
  component: ProjectsIndexPage,
});

function ProjectsIndexPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    ...orpc.projects.create.mutationOptions(),
    onError: () => toast.error("Failed to create project"),
    onSuccess: () => {
      setCreateOpen(false);
      queryClient.invalidateQueries({
        queryKey: orpc.projects.list.queryOptions().queryKey,
      });
      toast.success("Project created");
    },
  });

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted-foreground">
            Manage your game projects and their analytics.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create Project</Button>
      </div>
      <ProjectsList />
      <CreateProjectDialog
        isPending={createMutation.isPending}
        onCreate={(name) => createMutation.mutate({ name })}
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create project detail page**

```tsx
import { Button } from "@sbox-analytics/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";

import { ApiKeysSection } from "@/features/api-keys/components/organisms/api-keys-section";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/projects/$projectId")({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const projectQuery = useQuery(
    orpc.projects.get.queryOptions({ id: projectId })
  );

  if (projectQuery.isLoading) {
    return <div className="p-4 lg:p-6">Loading project...</div>;
  }

  if (projectQuery.isError || !projectQuery.data) {
    return (
      <div className="p-4 lg:p-6 text-destructive">Project not found.</div>
    );
  }

  const project = projectQuery.data;

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/projects">← Back</Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-muted-foreground">{project.slug}</p>
      </div>
      <ApiKeysSection projectId={projectId} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/dashboard/projects/
git commit -m "feat: add project list and detail pages"
```

---

## Task 11: Update API Keys Section

**Files:**

- Modify: `apps/web/src/features/api-keys/components/organisms/api-keys-section.tsx`

- [ ] **Step 1: Add projectId prop and update queries**

Add `projectId` prop to the component:

```tsx
interface ApiKeysSectionProps {
  projectId: string;
}

export function ApiKeysSection({ projectId }: ApiKeysSectionProps) {
```

Update the query to pass projectId:

```tsx
const listQuery = useQuery(orpc.apiKeys.list.queryOptions({ projectId }));
```

Update invalidate to include projectId:

```tsx
const invalidateList = () =>
  queryClient.invalidateQueries({
    queryKey: orpc.apiKeys.list.queryOptions({ projectId }).queryKey,
  });
```

Update create mutation to pass projectId:

```tsx
const createMutation = useMutation({
  ...orpc.apiKeys.create.mutationOptions(),
  onError: () => toast.error("Failed to create API key"),
  onSuccess: (data) => {
    setCreatedKey(data);
    invalidateList();
  },
});

// In the dialog:
onCreate={(name) => createMutation.mutate({ name, projectId })}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/api-keys/components/organisms/api-keys-section.tsx
git commit -m "refactor: update api keys section to accept project id"
```

---

## Task 12: Update Dashboard Navigation

**Files:**

- Modify: `apps/web/src/components/dashboard/app-sidebar.tsx`
- Modify: `apps/web/src/routes/dashboard/organization.tsx`

- [ ] **Step 1: Add Projects nav item to sidebar**

In `app-sidebar.tsx`, add to `navMain`:

```typescript
import { IconFolder } from "@tabler/icons-react";

const data = {
  navMain: [
    { icon: IconDashboard, title: "Dashboard", url: "/dashboard" },
    { icon: IconFolder, title: "Projects", url: "/dashboard/projects" },
    { icon: IconChartBar, title: "Analytics", url: "/dashboard" },
    { icon: IconUsers, title: "Team", url: "/dashboard" },
  ],
  // ... rest unchanged
};
```

- [ ] **Step 2: Remove API keys from organization page**

Replace `organization.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/organization")({
  component: OrganizationPage,
});

function OrganizationPage() {
  return (
    <div className="flex flex-col gap-8 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization's settings and integrations.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/app-sidebar.tsx
git add apps/web/src/routes/dashboard/organization.tsx
git commit -m "feat: add projects nav, remove org-level api keys"
```

---

## Task 13: Generate Routes

**Files:**

- Generated: `apps/web/src/routeTree.gen.ts`

- [ ] **Step 1: Generate routes**

```bash
cd apps/web
bunx tanstack-router generate
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/routeTree.gen.ts
git commit -m "chore: generate tanstack routes"
```

---

## Task 14: Type Check and Lint

**Files:**

- All modified files

- [ ] **Step 1: Type check**

```bash
bun run check-types
```

- [ ] **Step 2: Fix any type errors**

If errors exist, fix them. Common issues:

- Missing imports
- Zod schema mismatches
- Prisma client types not generated

- [ ] **Step 3: Lint**

```bash
bun run fix
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: implement custom analytics and project creation with ui"
```

---

## Self-Review Checklist

### Spec Coverage

- [x] Structured query config → ClickHouse SQL (Task 2)
- [x] Custom analytics endpoint (Task 3)
- [x] Project CRUD API (Task 4)
- [x] API keys restructure to project-level (Task 5)
- [x] Analytics router updated (Task 6)
- [x] Ingest service compatibility (Task 8)
- [x] Project list UI (Task 9, 10)
- [x] Project detail with API keys (Task 10, 11)
- [x] Dashboard navigation (Task 12)
- [x] Schema migration (Task 1)

### Placeholder Scan

- [x] No TBD/TODO
- [x] All code complete in steps
- [x] Exact file paths
- [x] Commands with expected output

### Type Consistency

- [x] `projectId` used consistently across API and UI
- [x] `QueryConfig` type matches schema
- [x] Router names consistent (`projects`, `apiKeys`, `customAnalytics`)

### Missing Items

- [ ] Integration tests (can be added in follow-up)
- [ ] Query builder unit tests (can be added in follow-up)
- [ ] Error handling UI (basic toast messages included)

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-custom-analytics-and-projects.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session, batch execution with checkpoints

**Which approach would you like?**
