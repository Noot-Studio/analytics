# Project Navigation Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the dashboard sidebar between organization mode and a project-specific mode driven entirely by the URL, and back the project mode with four real data-driven pages (Overview, Events, Live Events, Settings).

**Architecture:** TanStack Router file-based routes are the single source of truth. `app-sidebar.tsx` reads the active route via `useRouterState`; when a `/dashboard/projects/$projectId` route is matched it renders project chrome (Back + name + environment badge + project nav), otherwise org chrome. The existing `$projectId.tsx` leaf becomes a layout route with nested page routes. A new `environment` enum lands on the Project model; the projects list derives SDK status/recent-activity from API-key usage to avoid per-row ClickHouse calls; a new `analytics.events` oRPC procedure aggregates events by type.

**Tech Stack:** React 19, TanStack Router (file-based) + TanStack Query, oRPC, shadcn/base-ui components (`@sbox-analytics/ui`), Recharts, Prisma 7 (Postgres, `db push` workflow — no migrations dir), ClickHouse, Bun, Ultracite (oxlint/oxfmt).

---

## Conventions & Ground Rules

- **No test harness exists.** Per the spec, verification per task = `bun x ultracite check` + `bun run check-types` (root) + manual smoke where noted. Do NOT add a test framework.
- **Routes stay thin.** Each route file wires loader/params and renders a feature organism. Domain UI lives in `apps/web/src/features/<domain>/components/{atoms,molecules,organisms}`. Generic app-shell chrome stays in `apps/web/src/components/dashboard/`.
- **Run all commands from the repo root** `/Users/nouchetm/Personal/sbox-analytics` unless stated.
- **Route tree regeneration:** Adding/restructuring routes regenerates `apps/web/src/routeTree.gen.ts` automatically when the Vite dev server or `bun run build` runs (via `@tanstack/router-plugin`). Never hand-edit `routeTree.gen.ts`.
- **DB workflow:** The repo has NO `packages/db/prisma/migrations/` directory — it uses `prisma db push`. The spec says "generate a migration"; in this repo that maps to `bun run db:push` + `bun run db:generate`. Do not introduce a migrations directory.
- **Commit after every task** with the exact message shown.

---

## File Structure

**Create:**

- `apps/web/src/components/dashboard/nav-config.ts` — `NavItem` type + `orgNavMain`/`orgNavSecondary` (generic shell config)
- `apps/web/src/features/projects/components/atoms/environment-badge.tsx` — `EnvironmentBadge` + exported `ProjectEnvironment` type
- `apps/web/src/features/projects/components/atoms/sdk-status-badge.tsx` — `SdkStatusBadge` + `SdkStatus` type
- `apps/web/src/features/projects/components/molecules/project-nav.tsx` — `projectNav(projectId)` item config
- `apps/web/src/features/projects/components/molecules/project-nav-header.tsx` — Back + name + environment badge
- `apps/web/src/features/projects/components/organisms/project-settings-view.tsx` — Settings body
- `apps/web/src/features/analytics/components/atoms/relative-time.tsx` — `formatRelativeTime` + `RelativeTime`
- `apps/web/src/features/analytics/components/molecules/metric-card.tsx`
- `apps/web/src/features/analytics/components/molecules/events-table.tsx`
- `apps/web/src/features/analytics/components/molecules/live-events-table.tsx`
- `apps/web/src/features/analytics/components/organisms/overview-view.tsx`
- `apps/web/src/features/analytics/components/organisms/events-view.tsx`
- `apps/web/src/features/analytics/components/organisms/live-events-view.tsx`
- `apps/web/src/routes/dashboard/projects/$projectId/index.tsx` — redirect to overview
- `apps/web/src/routes/dashboard/projects/$projectId/overview.tsx`
- `apps/web/src/routes/dashboard/projects/$projectId/events.tsx`
- `apps/web/src/routes/dashboard/projects/$projectId/live.tsx`
- `apps/web/src/routes/dashboard/projects/$projectId/settings.tsx`

**Modify:**

- `packages/db/prisma/schema/project.prisma` — add `ProjectEnvironment` enum + field
- `packages/api/src/routers/projects.ts` — `create` accepts `environment`; `get`/`list` return `environment`; `list` returns active-key `lastUsedAt`
- `packages/api/src/routers/analytics.ts` — add `events` procedure
- `apps/web/src/components/dashboard/app-sidebar.tsx` — route-driven mode switch
- `apps/web/src/features/projects/components/molecules/create-project-dialog.tsx` — environment Select
- `apps/web/src/features/projects/components/molecules/project-card.tsx` — environment badge + SDK status + activity
- `apps/web/src/features/projects/components/organisms/projects-list.tsx` — derive status/activity, pass new props
- `apps/web/src/routes/dashboard/projects/index.tsx` — pass `environment` to create mutation
- `apps/web/src/routes/dashboard/projects/$projectId.tsx` — convert leaf → layout with loader

---

### Task 1: Add `environment` to the Project model

**Files:**

- Modify: `packages/db/prisma/schema/project.prisma`

- [ ] **Step 1: Add the enum and field**

The current file:

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
```

Add the enum above the model and the field after `name`:

```prisma
enum ProjectEnvironment {
  Development
  Staging
  Production
}

model Project {
  id             String             @id @default(cuid())
  slug           String
  name           String
  environment    ProjectEnvironment @default(Development)
  organizationId String
  organization   Organization       @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  apiKeys ApiKey[]

  @@unique([organizationId, slug])
  @@index([organizationId])
  @@map("project")
}
```

- [ ] **Step 2: Push schema and regenerate the Prisma client**

Run:

```bash
bun run db:push
bun run db:generate
```

Expected: `db push` reports the `project` table altered with a new `environment` column (default `Development`); `db:generate` regenerates the client with the `ProjectEnvironment` enum. No data loss prompt (the column has a default).

- [ ] **Step 3: Typecheck**

Run: `bun run check-types`
Expected: PASS (the generated client now knows `environment`; existing selects are unaffected).

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema/project.prisma
git commit -m "feat(db): add environment enum to Project model"
```

---

### Task 2: Return & accept `environment` in the projects router; expose key usage on list

**Files:**

- Modify: `packages/api/src/routers/projects.ts`

The router already imports `{ z }`, `prisma`, `ORPCError`, `protectedProcedure` and defines `requireActiveOrg`, `generateSlug`, `assertOrgMembership`, `assertProjectAccess`. Only the three procedures change.

- [ ] **Step 1: `create` — accept `environment` and persist it**

Current `create` input + data (lines ~58–95):

```ts
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
```

Replace the input object and add `environment` to the `create` data + select. New version:

```ts
  create: protectedProcedure
    .input(
      z.object({
        environment: z
          .enum(["Development", "Staging", "Production"])
          .default("Development"),
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(64).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const organizationId = requireActiveOrg(context);
      await assertOrgMembership(context.session.user.id, organizationId);

      const slug = input.slug || generateSlug(input.name);
```

Then in the same handler, the `prisma.project.create` call. Current:

```ts
const project = await prisma.project.create({
  data: {
    name: input.name,
    organizationId,
    slug,
  },
  select: {
    createdAt: true,
    id: true,
    name: true,
    organizationId: true,
    slug: true,
  },
});
```

New (add `environment` to both `data` and `select`):

```ts
const project = await prisma.project.create({
  data: {
    environment: input.environment,
    name: input.name,
    organizationId,
    slug,
  },
  select: {
    createdAt: true,
    environment: true,
    id: true,
    name: true,
    organizationId: true,
    slug: true,
  },
});
```

- [ ] **Step 2: `get` — return `environment`**

In the `get` procedure's `prisma.project.findFirst` select (currently `apiKeys {...}, createdAt, id, name, organizationId, slug`), add `environment: true`:

```ts
const project = await prisma.project.findFirst({
  select: {
    apiKeys: {
      select: {
        createdAt: true,
        id: true,
        lastUsedAt: true,
        name: true,
        publishableKey: true,
      },
      where: { revokedAt: null },
    },
    createdAt: true,
    environment: true,
    id: true,
    name: true,
    organizationId: true,
    slug: true,
  },
  where: { id: input.id },
});
```

- [ ] **Step 3: `list` — return `environment` and active-key `lastUsedAt`**

Replace the `_count`-based select. Current `list`:

```ts
  list: protectedProcedure.handler(async ({ context }) => {
    const organizationId = requireActiveOrg(context);
    await assertOrgMembership(context.session.user.id, organizationId);

    return prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        _count: {
          select: { apiKeys: { where: { revokedAt: null } } },
        },
        createdAt: true,
        id: true,
        name: true,
        slug: true,
      },
      where: { organizationId },
    });
  }),
```

New (return active keys' `lastUsedAt` array + `environment`; the UI derives count/status/activity from this — no extra ClickHouse call):

```ts
  list: protectedProcedure.handler(async ({ context }) => {
    const organizationId = requireActiveOrg(context);
    await assertOrgMembership(context.session.user.id, organizationId);

    return prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        apiKeys: {
          select: { lastUsedAt: true },
          where: { revokedAt: null },
        },
        createdAt: true,
        environment: true,
        id: true,
        name: true,
        slug: true,
      },
      where: { organizationId },
    });
  }),
```

> NOTE: `projects-list.tsx` (Task 8) currently reads `project._count.apiKeys`. That breaks after this change and is fixed in Task 8. Expect a web typecheck error on `_count` until then — `packages/api` itself still typechecks.

- [ ] **Step 4: Typecheck the API package**

Run: `bun run check-types`
Expected: `packages/api` PASSES. (`apps/web` may report a `_count` error — resolved in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/projects.ts
git commit -m "feat(api): expose project environment and active-key usage"
```

---

### Task 3: Add the `analytics.events` procedure

**Files:**

- Modify: `packages/api/src/routers/analytics.ts`

The file already imports `{ ORPCError }`, `prisma`, `{ z }`, `clickhouse`, `protectedProcedure`, defines `dailyInput`, `dailyRow`, the local `assertProjectAccess(projectId, userId)`, and exports `analyticsRouter` with `daily` and `recent`. Reuse `dailyInput` (same `{ from, projectId, to }` window) for consistency.

- [ ] **Step 1: Add an `eventsRow` schema next to `dailyRow`**

After the `dailyRow` definition (ends at the `});` around line 20), add:

```ts
const eventsRow = z.object({
  event_count: z.number(),
  event_type: z.string(),
  unique_players: z.number(),
});
```

- [ ] **Step 2: Add the `events` procedure to `analyticsRouter`**

Inside the `analyticsRouter` object, after the `daily` procedure (before `recent`), add:

```ts
  // Aggregated event-type totals over a date window — backs the Events table.
  events: protectedProcedure
    .input(dailyInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const result = await clickhouse().query({
        format: "JSON",
        query: `
          SELECT
            event_type                           AS event_type,
            toUInt64(countMerge(event_count))    AS event_count,
            toUInt64(uniqMerge(unique_players))  AS unique_players
          FROM analytics.events_daily
          WHERE project_id = {projectId:String}
            AND event_date BETWEEN {from:Date} AND {to:Date}
          GROUP BY event_type
          ORDER BY event_count DESC
        `,
        query_params: input,
      });

      const json = await result.json<z.infer<typeof eventsRow>>();
      return z.array(eventsRow).parse(json.data);
    }),
```

- [ ] **Step 3: Typecheck**

Run: `bun run check-types`
Expected: `packages/api` PASSES.

- [ ] **Step 4: Manual smoke (optional but recommended)**

If the dev stack is running (`bun run dev` + ClickHouse seeded), confirm the procedure is reachable; otherwise rely on the typecheck. There is no automated test harness.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/analytics.ts
git commit -m "feat(api): add analytics.events aggregation procedure"
```

---

### Task 4: Shared UI atoms (environment badge, SDK status badge, relative time)

**Files:**

- Create: `apps/web/src/features/projects/components/atoms/environment-badge.tsx`
- Create: `apps/web/src/features/projects/components/atoms/sdk-status-badge.tsx`
- Create: `apps/web/src/features/analytics/components/atoms/relative-time.tsx`

`Badge` (`@sbox-analytics/ui/components/badge`) supports `variant: default | secondary | outline | destructive | ghost | link`.

- [ ] **Step 1: Create `environment-badge.tsx`**

```tsx
import { Badge } from "@sbox-analytics/ui/components/badge";

export type ProjectEnvironment = "Development" | "Staging" | "Production";

const ENV_VARIANT: Record<
  ProjectEnvironment,
  "default" | "secondary" | "outline"
> = {
  Development: "secondary",
  Production: "default",
  Staging: "outline",
};

export function EnvironmentBadge({
  environment,
}: {
  environment: ProjectEnvironment;
}) {
  return <Badge variant={ENV_VARIANT[environment]}>{environment}</Badge>;
}
```

- [ ] **Step 2: Create `sdk-status-badge.tsx`**

```tsx
import { Badge } from "@sbox-analytics/ui/components/badge";

export type SdkStatus = "no-key" | "awaiting" | "connected";

const STATUS_CONFIG: Record<
  SdkStatus,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  awaiting: { label: "Awaiting data", variant: "outline" },
  connected: { label: "Connected", variant: "default" },
  "no-key": { label: "No API key", variant: "secondary" },
};

export function SdkStatusBadge({ status }: { status: SdkStatus }) {
  const { label, variant } = STATUS_CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
```

- [ ] **Step 3: Create `relative-time.tsx`**

```tsx
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

export function formatRelativeTime(date: Date | string | null): string {
  if (!date) {
    return "—";
  }
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < SECONDS_PER_MINUTE) {
    return "just now";
  }
  if (seconds < SECONDS_PER_HOUR) {
    return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m ago`;
  }
  if (seconds < SECONDS_PER_DAY) {
    return `${Math.floor(seconds / SECONDS_PER_HOUR)}h ago`;
  }
  return `${Math.floor(seconds / SECONDS_PER_DAY)}d ago`;
}

export function RelativeTime({ date }: { date: Date | string | null }) {
  return <span>{formatRelativeTime(date)}</span>;
}
```

- [ ] **Step 4: Check & typecheck**

Run: `bun x ultracite check && bun run check-types`
Expected: PASS (these files are not yet imported anywhere).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/projects/components/atoms/environment-badge.tsx \
        apps/web/src/features/projects/components/atoms/sdk-status-badge.tsx \
        apps/web/src/features/analytics/components/atoms/relative-time.tsx
git commit -m "feat(web): add environment, sdk-status, and relative-time atoms"
```

---

### Task 5: Add the environment Select to the create-project dialog

**Files:**

- Modify: `apps/web/src/features/projects/components/molecules/create-project-dialog.tsx`
- Modify: `apps/web/src/routes/dashboard/projects/index.tsx`

The `Select` component is base-ui based; API: `<Select value={v} onValueChange={fn}>` containing `SelectTrigger > SelectValue`, `SelectContent > SelectItem value=...`.

- [ ] **Step 1: Rewrite `create-project-dialog.tsx`**

Full new file (adds environment state + Select; widens `onCreate`):

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { useState } from "react";

import type { ProjectEnvironment } from "../atoms/environment-badge";

interface CreateProjectDialogProps {
  isPending: boolean;
  onCreate: (name: string, environment: ProjectEnvironment) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const ENVIRONMENTS: ProjectEnvironment[] = [
  "Development",
  "Staging",
  "Production",
];

export const CreateProjectDialog = ({
  isPending,
  onCreate,
  onOpenChange,
  open,
}: CreateProjectDialogProps) => {
  const [name, setName] = useState("");
  const [environment, setEnvironment] =
    useState<ProjectEnvironment>("Development");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim(), environment);
      setName("");
      setEnvironment("Development");
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
            <div className="grid gap-2">
              <Label htmlFor="environment">Environment</Label>
              <Select
                onValueChange={(value) => {
                  if (value) {
                    setEnvironment(value as ProjectEnvironment);
                  }
                }}
                value={environment}
              >
                <SelectTrigger id="environment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENVIRONMENTS.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
};
```

- [ ] **Step 2: Update the create mutation call in `routes/dashboard/projects/index.tsx`**

Current (line ~43–48):

```tsx
<CreateProjectDialog
  isPending={createMutation.isPending}
  onCreate={(name) => createMutation.mutate({ name })}
  onOpenChange={setCreateOpen}
  open={createOpen}
/>
```

New:

```tsx
<CreateProjectDialog
  isPending={createMutation.isPending}
  onCreate={(name, environment) => createMutation.mutate({ environment, name })}
  onOpenChange={setCreateOpen}
  open={createOpen}
/>
```

- [ ] **Step 3: Check & typecheck**

Run: `bun x ultracite check && bun run check-types`
Expected: PASS. (`projects.create` accepts `environment` from Task 2.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/projects/components/molecules/create-project-dialog.tsx \
        apps/web/src/routes/dashboard/projects/index.tsx
git commit -m "feat(web): choose environment when creating a project"
```

---

### Task 6: Project card — environment badge, SDK status, recent activity

**Files:**

- Modify: `apps/web/src/features/projects/components/molecules/project-card.tsx`

- [ ] **Step 1: Rewrite `project-card.tsx`**

Full new file (replaces the `apiKeyCount`-only version). The card now shows the environment badge in the header, the SDK status badge, the active-key count, and relative recent activity:

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sbox-analytics/ui/components/card";
import { Link } from "@tanstack/react-router";

import { RelativeTime } from "@/features/analytics/components/atoms/relative-time";

import { EnvironmentBadge } from "../atoms/environment-badge";
import type { ProjectEnvironment } from "../atoms/environment-badge";
import { SdkStatusBadge } from "../atoms/sdk-status-badge";
import type { SdkStatus } from "../atoms/sdk-status-badge";

interface ProjectCardProps {
  id: string;
  name: string;
  slug: string;
  environment: ProjectEnvironment;
  apiKeyCount: number;
  sdkStatus: SdkStatus;
  lastActivityAt: Date | string | null;
}

export const ProjectCard = ({
  id,
  name,
  slug,
  environment,
  apiKeyCount,
  sdkStatus,
  lastActivityAt,
}: ProjectCardProps) => (
  <Card>
    <CardHeader>
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle>{name}</CardTitle>
          <CardDescription>{slug}</CardDescription>
        </div>
        <EnvironmentBadge environment={environment} />
      </div>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SdkStatusBadge status={sdkStatus} />
        <span className="text-sm text-muted-foreground">
          {apiKeyCount} API key{apiKeyCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Last activity: <RelativeTime date={lastActivityAt} />
        </span>
        <Link
          className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-colors hover:bg-muted hover:text-foreground"
          params={{ projectId: id }}
          to="/dashboard/projects/$projectId"
        >
          View
        </Link>
      </div>
    </CardContent>
  </Card>
);
```

- [ ] **Step 2: Check (typecheck will still fail until Task 7)**

Run: `bun x ultracite check`
Expected: PASS (format/lint). `bun run check-types` will still error in `projects-list.tsx` (old props + `_count`) until Task 7 — that's expected; do NOT fix it here.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/projects/components/molecules/project-card.tsx
git commit -m "feat(web): show environment, SDK status, and activity on project cards"
```

---

### Task 7: Projects list — derive SDK status and recent activity

**Files:**

- Modify: `apps/web/src/features/projects/components/organisms/projects-list.tsx`

- [ ] **Step 1: Rewrite `projects-list.tsx`**

Full new file. It derives `sdkStatus`, `apiKeyCount`, and `lastActivityAt` from the active-key `lastUsedAt` array returned by `projects.list` (Task 2), then passes them to `ProjectCard`:

```tsx
import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import type { SdkStatus } from "../atoms/sdk-status-badge";
import { ProjectCard } from "../molecules/project-card";

type ApiKeyUsage = { lastUsedAt: Date | string | null };

function deriveSdkStatus(keys: ApiKeyUsage[]): SdkStatus {
  if (keys.length === 0) {
    return "no-key";
  }
  if (keys.some((key) => key.lastUsedAt)) {
    return "connected";
  }
  return "awaiting";
}

function latestActivity(keys: ApiKeyUsage[]): Date | null {
  const times = keys
    .map((key) => key.lastUsedAt)
    .filter((value): value is Date | string => value != null)
    .map((value) => new Date(value).getTime());
  return times.length > 0 ? new Date(Math.max(...times)) : null;
}

export const ProjectsList = () => {
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

  if (projects.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No projects yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard
          apiKeyCount={project.apiKeys.length}
          environment={project.environment}
          id={project.id}
          key={project.id}
          lastActivityAt={latestActivity(project.apiKeys)}
          name={project.name}
          sdkStatus={deriveSdkStatus(project.apiKeys)}
          slug={project.slug}
        />
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Check & typecheck**

Run: `bun x ultracite check && bun run check-types`
Expected: PASS. The `_count` error from Task 2/6 is now resolved across the web app.

- [ ] **Step 3: Manual smoke**

Start the app (`bun run dev`), open `/dashboard/projects`. Expect cards with environment badge, an SDK-status badge (`No API key`/`Awaiting data`/`Connected`), key count, and "Last activity: …".

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/projects/components/organisms/projects-list.tsx
git commit -m "feat(web): derive SDK status and recent activity in projects list"
```

---

### Task 8: Navigation config + project nav header

**Files:**

- Create: `apps/web/src/components/dashboard/nav-config.ts`
- Create: `apps/web/src/features/projects/components/molecules/project-nav.tsx`
- Create: `apps/web/src/features/projects/components/molecules/project-nav-header.tsx`

`NavMain`/`NavSecondary` accept `items: { title: string; url: string; icon?: Icon }[]` and render `<Link to={item.url} />` (a plain string `to`, exactly as today). So project nav items use resolved pathname strings.

- [ ] **Step 1: Create `nav-config.ts`** (generic shell config)

```ts
import {
  IconDashboard,
  IconFolder,
  IconHelp,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";

export interface NavItem {
  title: string;
  url: string;
  icon?: Icon;
}

export const orgNavMain: NavItem[] = [
  { icon: IconDashboard, title: "Dashboard", url: "/dashboard" },
  { icon: IconFolder, title: "Projects", url: "/dashboard/projects" },
  { icon: IconUsers, title: "Team", url: "/dashboard" },
];

export const orgNavSecondary: NavItem[] = [
  { icon: IconSettings, title: "Settings", url: "/dashboard/settings" },
  { icon: IconHelp, title: "Get Help", url: "/dashboard" },
];
```

- [ ] **Step 2: Create `project-nav.tsx`** (project-domain nav config — all deferred pages get added here later)

```ts
import {
  IconActivity,
  IconChartBar,
  IconListDetails,
  IconSettings,
} from "@tabler/icons-react";

import type { NavItem } from "@/components/dashboard/nav-config";

export function projectNav(projectId: string): NavItem[] {
  const base = `/dashboard/projects/${projectId}`;
  return [
    { icon: IconChartBar, title: "Overview", url: `${base}/overview` },
    { icon: IconListDetails, title: "Events", url: `${base}/events` },
    { icon: IconActivity, title: "Live Events", url: `${base}/live` },
    { icon: IconSettings, title: "Settings", url: `${base}/settings` },
  ];
}
```

> If `bun run check-types` flags any of `IconActivity`/`IconListDetails` as missing from `@tabler/icons-react`, swap for a present one (e.g. `IconPulse`, `IconList`) — the typecheck in Step 4 will catch it.

- [ ] **Step 3: Create `project-nav-header.tsx`** (Back + name + environment badge)

```tsx
import { IconArrowLeft } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

import { EnvironmentBadge } from "../atoms/environment-badge";

export function ProjectNavHeader({ projectId }: { projectId: string }) {
  const projectQuery = useQuery(
    orpc.projects.get.queryOptions({ input: { id: projectId } })
  );
  const project = projectQuery.data;

  return (
    <div className="flex flex-col gap-2 px-1 py-1.5">
      <Link
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        to="/dashboard/projects"
      >
        <IconArrowLeft className="size-4" />
        Back to projects
      </Link>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">
          {project?.name ?? "Loading…"}
        </span>
        {project ? (
          <EnvironmentBadge environment={project.environment} />
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Check & typecheck**

Run: `bun x ultracite check && bun run check-types`
Expected: PASS (not yet imported into the sidebar).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/nav-config.ts \
        apps/web/src/features/projects/components/molecules/project-nav.tsx \
        apps/web/src/features/projects/components/molecules/project-nav-header.tsx
git commit -m "feat(web): add org/project nav config and project nav header"
```

---

### Task 9: Route-driven sidebar mode switch

**Files:**

- Modify: `apps/web/src/components/dashboard/app-sidebar.tsx`

This removes the hardcoded `data` blob, the `NavDocuments` usage, and the template stubs (Data Library, Reports, Word Assistant, the placeholder "Analytics" item, the "Search" secondary item). It keeps `NavMain`/`NavSecondary`/`NavUser`/`OrgSwitcher` and switches mode by route.

- [ ] **Step 1: Rewrite `app-sidebar.tsx`**

Full new file:

```tsx
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@sbox-analytics/ui/components/sidebar";
import { useRouterState } from "@tanstack/react-router";
import type * as React from "react";

import { orgNavMain, orgNavSecondary } from "@/components/dashboard/nav-config";
import { NavMain } from "@/components/dashboard/nav-main";
import { NavSecondary } from "@/components/dashboard/nav-secondary";
import { NavUser } from "@/components/dashboard/nav-user";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { projectNav } from "@/features/projects/components/molecules/project-nav";
import { ProjectNavHeader } from "@/features/projects/components/molecules/project-nav-header";

const PROJECT_ROUTE_ID = "/dashboard/projects/$projectId";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const projectId = useRouterState({
    select: (state) => {
      const match = state.matches.find(
        (entry) => entry.routeId === PROJECT_ROUTE_ID
      );
      return (match?.params as { projectId?: string } | undefined)?.projectId;
    },
  });

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        {projectId ? (
          <ProjectNavHeader projectId={projectId} />
        ) : (
          <OrgSwitcher />
        )}
      </SidebarHeader>
      <SidebarContent>
        {projectId ? (
          <NavMain items={projectNav(projectId)} />
        ) : (
          <>
            <NavMain items={orgNavMain} />
            <NavSecondary className="mt-auto" items={orgNavSecondary} />
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
```

> The `NavMain` "Quick Create"/Inbox buttons are shared chrome and remain in both modes; the spec does not ask to remove them.

- [ ] **Step 2: Check & typecheck**

Run: `bun x ultracite check && bun run check-types`
Expected: PASS. `routeId` `"/dashboard/projects/$projectId"` is valid (the layout route exists today; Task 10 keeps it).

- [ ] **Step 3: Manual smoke**

`bun run dev`, open `/dashboard` (org chrome: Dashboard/Projects/Team + Settings/Get Help), then a project URL `/dashboard/projects/<id>/overview` (project chrome: Back + name + env badge + Overview/Events/Live/Settings). Project page bodies land in Tasks 10–13.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/dashboard/app-sidebar.tsx
git commit -m "feat(web): route-driven org/project sidebar mode switch"
```

---

### Task 10: Convert `$projectId` leaf into a layout with nested page routes

**Files:**

- Modify: `apps/web/src/routes/dashboard/projects/$projectId.tsx` (leaf → layout)
- Create: `apps/web/src/routes/dashboard/projects/$projectId/index.tsx`
- Create: `apps/web/src/routes/dashboard/projects/$projectId/overview.tsx`
- Create: `apps/web/src/routes/dashboard/projects/$projectId/events.tsx`
- Create: `apps/web/src/routes/dashboard/projects/$projectId/live.tsx`
- Create: `apps/web/src/routes/dashboard/projects/$projectId/settings.tsx`

In TanStack file-based routing, when both `$projectId.tsx` and a `$projectId/` directory exist, `$projectId.tsx` becomes the layout for the nested routes. The layout fetches the project in a loader (router context exposes `{ orpc, queryClient }`) and redirects to the projects list on failure. The page routes are thin wrappers around feature organisms created in Tasks 11–14.

- [ ] **Step 1: Rewrite `$projectId.tsx` as a layout route with a loader**

Full new file (the previous body — name + `ApiKeysSection` — is removed; name now lives in the sidebar header, `ApiKeysSection` moves to Settings):

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/projects/$projectId")({
  component: ProjectLayout,
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        context.orpc.projects.get.queryOptions({
          input: { id: params.projectId },
        })
      );
    } catch {
      toast.error("Project not found");
      throw redirect({ to: "/dashboard/projects" });
    }
  },
});

function ProjectLayout() {
  return <Outlet />;
}
```

- [ ] **Step 2: Create `$projectId/index.tsx`** (default landing → overview)

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/projects/$projectId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      params: { projectId: params.projectId },
      to: "/dashboard/projects/$projectId/overview",
    });
  },
});
```

- [ ] **Step 3: Create the four page route stubs**

These import organisms that are created in Tasks 11–14. Create all four now; they will not typecheck until those organisms exist, so the typecheck/commit for this task happens after Task 13’s Settings view is in place. (If running tasks strictly in order, create only the route files whose organism already exists, or temporarily render a placeholder — but the cleanest path is to do Task 10 route files together with Tasks 11–14 and commit per page. The structure below is the target.)

`$projectId/overview.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { OverviewView } from "@/features/analytics/components/organisms/overview-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/overview")(
  {
    component: OverviewPage,
  }
);

function OverviewPage() {
  const { projectId } = Route.useParams();
  return <OverviewView projectId={projectId} />;
}
```

`$projectId/events.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { EventsView } from "@/features/analytics/components/organisms/events-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/events")({
  component: EventsPage,
});

function EventsPage() {
  const { projectId } = Route.useParams();
  return <EventsView projectId={projectId} />;
}
```

`$projectId/live.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { LiveEventsView } from "@/features/analytics/components/organisms/live-events-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/live")({
  component: LivePage,
});

function LivePage() {
  const { projectId } = Route.useParams();
  return <LiveEventsView projectId={projectId} />;
}
```

`$projectId/settings.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { ProjectSettingsView } from "@/features/projects/components/organisms/project-settings-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/settings")(
  {
    component: SettingsPage,
  }
);

function SettingsPage() {
  const { projectId } = Route.useParams();
  return <ProjectSettingsView projectId={projectId} />;
}
```

- [ ] **Step 4: Regenerate the route tree**

Start the dev server once so `@tanstack/router-plugin` regenerates `routeTree.gen.ts`:

Run: `bun run dev` (let it boot, confirm no route-tree errors in the terminal, then stop it). Alternatively `bun run build` regenerates it as part of the build.
Expected: `routeTree.gen.ts` now contains the nested `overview`/`events`/`live`/`settings` routes and the `$projectId` layout. Do not edit it by hand.

- [ ] **Step 5: Defer typecheck/commit to Task 13**

Because the page routes import organisms built in Tasks 11–14, run the full check after Task 13. Proceed to Task 11.

> Commit note: this task is committed together with Task 13 (`feat(web): add project pages …`) once all organisms exist and `bun run check-types` passes — or, if you prefer per-file commits, stub each organism with a minimal `export function X({ projectId }: { projectId: string }) { return null; }` first, commit Task 10, then flesh out in Tasks 11–14.

---

### Task 11: Overview page (metric card + overview view)

**Files:**

- Create: `apps/web/src/features/analytics/components/molecules/metric-card.tsx`
- Create: `apps/web/src/features/analytics/components/organisms/overview-view.tsx`

Backed by `analytics.daily` over the last 30 days. Totals/breakdown/trend are computed client-side; metrics not in the data render as labeled "Coming soon" cards (never faked).

- [ ] **Step 1: Create `metric-card.tsx`**

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sbox-analytics/ui/components/card";

export function MetricCard({
  label,
  value,
  comingSoon = false,
}: {
  label: string;
  value?: string | number;
  comingSoon?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {comingSoon ? "Coming soon" : value}
        </CardTitle>
      </CardHeader>
      {comingSoon ? (
        <CardContent className="text-xs text-muted-foreground">
          Not enough data yet to compute this.
        </CardContent>
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 2: Create `overview-view.tsx`**

`analytics.daily` returns rows `{ event_date, event_type, event_count, unique_players, unique_sessions }`. Unique Players/Sessions are summed across daily rows — a documented daily-sum approximation (a true global distinct isn't available from the rollup). The trend chart uses Recharts (already a dependency).

```tsx
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";

import { MetricCard } from "../molecules/metric-card";

const OVERVIEW_WINDOW_DAYS = 30;

function dateInput(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function OverviewView({ projectId }: { projectId: string }) {
  const query = useQuery(
    orpc.analytics.daily.queryOptions({
      input: {
        from: dateInput(OVERVIEW_WINDOW_DAYS),
        projectId,
        to: dateInput(0),
      },
    })
  );

  if (query.isLoading) {
    return <div className="p-4 lg:p-6">Loading overview…</div>;
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">
        Failed to load analytics.
      </div>
    );
  }

  const rows = query.data ?? [];

  const totalEvents = rows.reduce((sum, row) => sum + row.event_count, 0);
  const uniquePlayers = rows.reduce((sum, row) => sum + row.unique_players, 0);
  const sessions = rows.reduce((sum, row) => sum + row.unique_sessions, 0);

  const byDate = new Map<string, number>();
  for (const row of rows) {
    byDate.set(
      row.event_date,
      (byDate.get(row.event_date) ?? 0) + row.event_count
    );
  }
  const trend = [...byDate.entries()]
    .map(([date, events]) => ({ date, events }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byType = new Map<string, number>();
  for (const row of rows) {
    byType.set(
      row.event_type,
      (byType.get(row.event_type) ?? 0) + row.event_count
    );
  }
  const types = [...byType.entries()]
    .map(([eventType, count]) => ({ count, eventType }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="font-semibold text-2xl">Overview</h1>
        <p className="text-muted-foreground">
          Last {OVERVIEW_WINDOW_DAYS} days.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground">
          No data yet — connect your SDK to start seeing events.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Events" value={totalEvents.toLocaleString()} />
        <MetricCard
          label="Unique Players (sum/day)"
          value={uniquePlayers.toLocaleString()}
        />
        <MetricCard
          label="Sessions (sum/day)"
          value={sessions.toLocaleString()}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard comingSoon label="Retention (D1/D7/D30)" />
        <MetricCard comingSoon label="Avg session duration" />
        <MetricCard comingSoon label="DAU over time" />
      </div>

      {trend.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">Events per day</h2>
          <ResponsiveContainer height={240} width="100%">
            <AreaChart data={trend}>
              <XAxis dataKey="date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Area
                dataKey="events"
                fillOpacity={0.2}
                stroke="var(--primary)"
                fill="var(--primary)"
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {types.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-3 font-medium text-sm">Events by type</h2>
          <ul className="flex flex-col gap-2">
            {types.map((entry) => (
              <li
                className="flex items-center justify-between text-sm"
                key={entry.eventType}
              >
                <span className="font-medium">{entry.eventType}</span>
                <span className="text-muted-foreground tabular-nums">
                  {entry.count.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Check & typecheck**

Run: `bun x ultracite check && bun run check-types`
Expected: `overview-view.tsx`/`metric-card.tsx` and `$projectId/overview.tsx` typecheck. (`events.tsx`/`live.tsx`/`settings.tsx` route files still error until their organisms exist — Tasks 12–13.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/analytics/components/molecules/metric-card.tsx \
        apps/web/src/features/analytics/components/organisms/overview-view.tsx \
        apps/web/src/routes/dashboard/projects/\$projectId.tsx \
        apps/web/src/routes/dashboard/projects/\$projectId/index.tsx \
        apps/web/src/routes/dashboard/projects/\$projectId/overview.tsx \
        apps/web/src/routeTree.gen.ts
git commit -m "feat(web): add project Overview page and project layout route"
```

---

### Task 12: Events page (sortable events table + events view)

**Files:**

- Create: `apps/web/src/features/analytics/components/molecules/events-table.tsx`
- Create: `apps/web/src/features/analytics/components/organisms/events-view.tsx`

Backed by `analytics.events` (Task 3), returning `{ event_type, event_count, unique_players }` per type. Sortable table + time-window selector. `Table` exports: `Table, TableBody, TableCell, TableHead, TableHeader, TableRow`.

- [ ] **Step 1: Create `events-table.tsx`** (client-side sortable)

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sbox-analytics/ui/components/table";
import { useState } from "react";

export interface EventRow {
  event_type: string;
  event_count: number;
  unique_players: number;
}

type SortKey = "event_type" | "event_count" | "unique_players";

export function EventsTable({ rows }: { rows: EventRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("event_count");
  const [descending, setDescending] = useState(true);

  const sorted = [...rows].sort((a, b) => {
    let result: number;
    if (sortKey === "event_type") {
      result = a.event_type.localeCompare(b.event_type);
    } else {
      result = a[sortKey] - b[sortKey];
    }
    return descending ? -result : result;
  });

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDescending((value) => !value);
    } else {
      setSortKey(key);
      setDescending(true);
    }
  };

  const headerLabel = (key: SortKey, label: string) =>
    key === sortKey ? `${label} ${descending ? "↓" : "↑"}` : label;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead
            className="cursor-pointer select-none"
            onClick={() => toggleSort("event_type")}
          >
            {headerLabel("event_type", "Event")}
          </TableHead>
          <TableHead
            className="cursor-pointer select-none text-right"
            onClick={() => toggleSort("event_count")}
          >
            {headerLabel("event_count", "Count")}
          </TableHead>
          <TableHead
            className="cursor-pointer select-none text-right"
            onClick={() => toggleSort("unique_players")}
          >
            {headerLabel("unique_players", "Unique players")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={row.event_type}>
            <TableCell className="font-medium">{row.event_type}</TableCell>
            <TableCell className="text-right tabular-nums">
              {row.event_count.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.unique_players.toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Create `events-view.tsx`** (window selector + states)

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

import { EventsTable } from "../molecules/events-table";

const WINDOWS = [
  { days: 7, label: "Last 7 days", value: "7" },
  { days: 30, label: "Last 30 days", value: "30" },
  { days: 90, label: "Last 90 days", value: "90" },
];

function dateInput(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function EventsView({ projectId }: { projectId: string }) {
  const [windowValue, setWindowValue] = useState("30");
  const days = WINDOWS.find((entry) => entry.value === windowValue)?.days ?? 30;

  const query = useQuery(
    orpc.analytics.events.queryOptions({
      input: { from: dateInput(days), projectId, to: dateInput(0) },
    })
  );

  const rows = query.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-semibold text-2xl">Events</h1>
          <p className="text-muted-foreground">Event totals by type.</p>
        </div>
        <Select
          onValueChange={(value) => {
            if (value) {
              setWindowValue(value);
            }
          }}
          value={windowValue}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WINDOWS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? <div>Loading events…</div> : null}
      {query.isError ? (
        <div className="text-destructive">Failed to load events.</div>
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground">
          No events in this window.
        </div>
      ) : null}
      {rows.length > 0 ? <EventsTable rows={rows} /> : null}
    </div>
  );
}
```

- [ ] **Step 3: Check & typecheck**

Run: `bun x ultracite check && bun run check-types`
Expected: Overview + Events typecheck; `live.tsx`/`settings.tsx` route files still error until Tasks 13–14.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/analytics/components/molecules/events-table.tsx \
        apps/web/src/features/analytics/components/organisms/events-view.tsx \
        apps/web/src/routes/dashboard/projects/\$projectId/events.tsx \
        apps/web/src/routeTree.gen.ts
git commit -m "feat(web): add project Events page"
```

---

### Task 13: Live Events page (live-tailing table + view)

**Files:**

- Create: `apps/web/src/features/analytics/components/molecules/live-events-table.tsx`
- Create: `apps/web/src/features/analytics/components/organisms/live-events-view.tsx`

Backed by `analytics.recent` returning `{ event_type, timestamp, session_id, player_id, properties }`. Polls every ~5s with a pause toggle and an empty state.

- [ ] **Step 1: Create `live-events-table.tsx`**

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sbox-analytics/ui/components/table";

export interface LiveEventRow {
  event_type: string;
  timestamp: string;
  session_id: string;
  player_id: string;
  properties: string;
}

export function LiveEventsTable({ rows }: { rows: LiveEventRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>Player</TableHead>
          <TableHead>Session</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={`${row.timestamp}-${row.session_id}-${index}`}>
            <TableCell className="whitespace-nowrap tabular-nums">
              {row.timestamp}
            </TableCell>
            <TableCell className="font-medium">{row.event_type}</TableCell>
            <TableCell className="text-muted-foreground">
              {row.player_id}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {row.session_id}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Create `live-events-view.tsx`**

```tsx
import { Button } from "@sbox-analytics/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

import { LiveEventsTable } from "../molecules/live-events-table";

const POLL_INTERVAL_MS = 5000;
const LIVE_EVENT_LIMIT = 50;

export function LiveEventsView({ projectId }: { projectId: string }) {
  const [paused, setPaused] = useState(false);

  const query = useQuery({
    ...orpc.analytics.recent.queryOptions({
      input: { limit: LIVE_EVENT_LIMIT, projectId },
    }),
    refetchInterval: paused ? false : POLL_INTERVAL_MS,
  });

  const rows = query.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-semibold text-2xl">Live Events</h1>
          <p className="text-muted-foreground">
            Recent raw events, refreshed every {POLL_INTERVAL_MS / 1000}s.
          </p>
        </div>
        <Button onClick={() => setPaused((value) => !value)} variant="outline">
          {paused ? "Resume" : "Pause"}
        </Button>
      </div>

      {query.isLoading ? <div>Loading events…</div> : null}
      {query.isError ? (
        <div className="text-destructive">Failed to load live events.</div>
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground">
          No events yet — connect your SDK.
        </div>
      ) : null}
      {rows.length > 0 ? <LiveEventsTable rows={rows} /> : null}
    </div>
  );
}
```

- [ ] **Step 3: Check & typecheck**

Run: `bun x ultracite check && bun run check-types`
Expected: Overview + Events + Live typecheck; `settings.tsx` route file still errors until Task 14.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/analytics/components/molecules/live-events-table.tsx \
        apps/web/src/features/analytics/components/organisms/live-events-view.tsx \
        apps/web/src/routes/dashboard/projects/\$projectId/live.tsx \
        apps/web/src/routeTree.gen.ts
git commit -m "feat(web): add project Live Events page"
```

---

### Task 14: Settings page (API keys + environment + SDK snippet)

**Files:**

- Create: `apps/web/src/features/projects/components/organisms/project-settings-view.tsx`

Composes the existing `ApiKeysSection` (reused as-is), shows the environment (display-only — inline edit is out of scope; `projects.update` does not exist), and a copy-paste SDK snippet using the project's publishable key from `projects.get`.

- [ ] **Step 1: Create `project-settings-view.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";

import { ApiKeysSection } from "@/features/api-keys/components/organisms/api-keys-section";
import { orpc } from "@/utils/orpc";

import { EnvironmentBadge } from "../atoms/environment-badge";

export function ProjectSettingsView({ projectId }: { projectId: string }) {
  const projectQuery = useQuery(
    orpc.projects.get.queryOptions({ input: { id: projectId } })
  );
  const project = projectQuery.data;
  const publishableKey =
    project?.apiKeys[0]?.publishableKey ?? "pk_your_publishable_key";

  return (
    <div className="flex flex-col gap-8 p-4 lg:p-6">
      <div>
        <h1 className="font-semibold text-2xl">Settings</h1>
        <p className="text-muted-foreground">
          Manage API keys and SDK integration for this project.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-sm">Environment</h2>
        {project ? (
          <EnvironmentBadge environment={project.environment} />
        ) : (
          <span className="text-muted-foreground text-sm">Loading…</span>
        )}
      </section>

      <ApiKeysSection projectId={projectId} />

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-sm">SDK setup</h2>
        <p className="text-muted-foreground text-sm">
          Add this to your s&amp;box game to start sending events.
        </p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-4 text-xs">
          <code>{`var analytics = new SboxAnalytics( "${publishableKey}" );
analytics.Track( "level_complete", new {
    level = "tutorial",
    duration = 42.5f,
} );`}</code>
        </pre>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Regenerate route tree, full check & typecheck**

Run:

```bash
bun run build
bun x ultracite check
bun run check-types
```

Expected: `routeTree.gen.ts` includes all four nested routes; build succeeds; lint and typecheck PASS across the whole repo.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/projects/components/organisms/project-settings-view.tsx \
        apps/web/src/routes/dashboard/projects/\$projectId/settings.tsx \
        apps/web/src/routeTree.gen.ts
git commit -m "feat(web): add project Settings page with SDK snippet"
```

---

### Task 15: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full repo check**

Run:

```bash
bun x ultracite check
bun run check-types
bun run build
```

Expected: all PASS.

- [ ] **Step 2: Manual smoke (dev stack running)**

Run `bun run dev`, then verify:

- [ ] `/dashboard/projects` — cards show environment badge, SDK status, key count, last activity.
- [ ] Create a project, pick **Staging** in the dialog — the new card shows the Staging badge.
- [ ] Open a project → URL redirects to `/dashboard/projects/<id>/overview`; sidebar switches to project mode (Back + name + env badge + Overview/Events/Live/Settings).
- [ ] Overview: metric cards render; "Coming soon" cards labeled; trend + by-type render when data exists, empty state otherwise.
- [ ] Events: window selector changes results; column headers sort.
- [ ] Live Events: table refreshes (~5s); Pause stops refresh, Resume restarts; empty state when no events.
- [ ] Settings: API keys section works; environment badge shows; SDK snippet shows the project's publishable key.
- [ ] Click **Back to projects** → sidebar returns to org mode.
- [ ] Visit a bogus id `/dashboard/projects/does-not-exist/overview` → redirected to `/dashboard/projects` with a "Project not found" toast.
- [ ] Deep-link/refresh a project page directly → loads in project mode (URL is the source of truth).

- [ ] **Step 3: Final commit (if any manual fixups were needed)**

```bash
git add -A
git commit -m "chore(web): project navigation workflow verification fixups"
```

---

## Self-Review

**Spec coverage:**

- Route-driven org↔project sidebar switch + Back button → Tasks 8, 9, 10. ✓
- Project-scoped route structure (layout + nested) → Task 10. ✓
- Four core pages (Overview/Events/Live/Settings) → Tasks 11, 12, 13, 14. ✓
- New `analytics.events` procedure → Task 3. ✓
- `environment` field + create flow + cards → Tasks 1, 2, 5, 6. ✓
- Derived projects-list metadata (SDK status, recent activity) → Tasks 2, 7. ✓
- Feature/file map (analytics feature; projects/api-keys extended) → Tasks 4–14 match the spec's file map. ✓
- Loader redirect + toast on NOT_FOUND → Task 10. ✓
- Per-page loading/empty/error states → Tasks 11–13. ✓

**Deviations from the spec (intentional, noted):**

- Spec says "generate a Prisma migration"; repo has no migrations dir → use `db push` + `db:generate` (matches the established workflow). Task 1.
- Inline environment edit in Settings is explicitly optional in the spec and depends on a non-existent `projects.update`; left out (display-only). Task 14.
- Unique Players/Sessions on Overview are daily-sum approximations (labeled "sum/day"); a true global distinct isn't in the rollup. Task 11.

**Type consistency:** `ProjectEnvironment` defined once (environment-badge.tsx) and imported by card, dialog, settings; `SdkStatus` defined once (sdk-status-badge.tsx) and imported by projects-list; `NavItem` defined once (nav-config.ts) and imported by project-nav; `projectNav` signature `(projectId: string) => NavItem[]` used consistently in app-sidebar.

**Placeholder scan:** No TBD/TODO; every code step shows full file or exact before/after. Task 10's route stubs explicitly reference organisms built in Tasks 11–14, with a stated commit/stub strategy to keep typecheck green.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-project-navigation-workflow.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
