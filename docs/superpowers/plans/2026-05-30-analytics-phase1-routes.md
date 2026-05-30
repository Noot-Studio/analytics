# Analytics Phase 1 Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three Phase 1 behavioral analytics routes (`/players`, `/sessions`, `/maps`) plus the two ClickHouse materialized views that power them, and restructure the project sidebar into grouped sections.

**Architecture:** Each route is a thin TanStack Router file that delegates to a view organism. Each view calls one new oRPC procedure (registered under the `insights` router key) via `orpc.insights.<name>.queryOptions`. Procedures query ClickHouse — two new AggregatingMergeTree materialized views (`player_first_seen`, `sessions_summary`) provide first-seen dates and per-session start/end. Pure data-reshaping logic is extracted into testable helpers.

**Tech Stack:** TanStack Router (file-based), TanStack Query, oRPC + zod, ClickHouse (`@clickhouse/client`), Recharts, shadcn/ui, Bun test runner.

---

## Key Facts (verified against the codebase)

- **Router key is `insights`, not `analytics`.** `analyticsRouter` is registered as `insights:` in `packages/api/src/routers/index.ts`. Client calls are `orpc.insights.players.queryOptions(...)`.
- **Handler context arg is `context`, not `ctx`:** `.handler(async ({ context, input }) => { await assertProjectAccess(input.projectId, context.session.user.id); ... })`.
- **ClickHouse param types use full names:** `{projectId:String}`, `{from:Date}`, `{to:Date}` — not `:str`.
- **Procedures return parsed rows:** `const json = await result.json<z.infer<typeof Row>>(); return z.array(Row).parse(json.data);`.
- **`init.sql` only runs on a fresh ClickHouse volume.** New DDL must be added to `init.sql` (for fresh setups) AND applied to running volumes via `clickhouse-client`. Container name: `sbox-analytics-clickhouse`, db `analytics`, user `analytics`.
- **`routeTree.gen.ts` is auto-generated** by the TanStack Router plugin. Never hand-edit it — it regenerates when `bun run dev`/`bun run build` runs in `apps/web`.
- **No tests exist yet.** Use Bun's built-in runner: `bun test <path>`. No new dependency required.
- **Web data-fetch pattern** (`overview-view.tsx`): `useQuery(orpc.insights.X.queryOptions({ input: { from, projectId, to } }))`, then `query.isLoading` → Skeletons, `query.isError` → destructive message, else render. Date helpers from `../../lib/date-window` (`isoDaysAgo`).
- **Recharts** components import from `"recharts"`. Chart colors use `var(--primary)`.

---

## File Structure

**Create:**

- `packages/db/clickhouse/migrations/001_phase1_views.sql` — standalone DDL for the two MVs (applied to existing volumes)
- `apps/web/src/routes/dashboard/projects/$projectId/players.tsx`
- `apps/web/src/routes/dashboard/projects/$projectId/sessions.tsx`
- `apps/web/src/routes/dashboard/projects/$projectId/maps.tsx`
- `apps/web/src/features/analytics/components/organisms/players-view.tsx`
- `apps/web/src/features/analytics/components/organisms/sessions-view.tsx`
- `apps/web/src/features/analytics/components/organisms/maps-view.tsx`
- `apps/web/src/features/analytics/lib/heatmap.ts` — pure 7×24 grid builder (TDD)
- `apps/web/src/features/analytics/lib/heatmap.test.ts`

**Modify:**

- `packages/db/clickhouse/init.sql` — append the two MV definitions
- `packages/api/src/routers/analytics.ts` — add `players`, `sessions`, `maps` procedures + zod schemas
- `apps/web/src/features/projects/components/molecules/project-nav.tsx` — grouped nav with new entries
- `apps/web/src/components/dashboard/nav-config.ts` — extend `NavItem` with optional `group`
- `apps/web/src/components/dashboard/nav-main.tsx` — render group labels

---

## Task 1: ClickHouse materialized views (`player_first_seen` + `sessions_summary`)

**Files:**

- Modify: `packages/db/clickhouse/init.sql` (append at end)
- Create: `packages/db/clickhouse/migrations/001_phase1_views.sql`

These two MVs unblock `/players`, `/sessions`, and (partially) `/maps`. They follow the existing `events_daily` conventions in `init.sql`: `IF NOT EXISTS`, `'UTC'` timestamps, `PARTITION BY`, AggregatingMergeTree with `*State()` in the MV select.

- [ ] **Step 1: Append both MV definitions to `init.sql`**

Append this block to the end of `packages/db/clickhouse/init.sql`:

```sql

-- First-seen date per player — powers /players new-vs-returning and /retention cohorts.
CREATE TABLE IF NOT EXISTS analytics.player_first_seen
(
    project_id String,
    player_id  String,
    first_seen AggregateFunction(min, Date)
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, player_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.player_first_seen_mv
TO analytics.player_first_seen AS
SELECT
    project_id,
    player_id,
    minState(toDate(timestamp)) AS first_seen
FROM analytics.events
GROUP BY project_id, player_id;

-- Per-session start/end — powers /sessions duration, avg length, and time-of-day heatmap.
CREATE TABLE IF NOT EXISTS analytics.sessions_summary
(
    project_id String,
    session_id String,
    player_id  String,
    event_date Date,
    started_at AggregateFunction(min, DateTime64(3, 'UTC')),
    ended_at   AggregateFunction(max, DateTime64(3, 'UTC'))
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (project_id, event_date, session_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.sessions_summary_mv
TO analytics.sessions_summary AS
SELECT
    project_id,
    session_id,
    player_id,
    toDate(timestamp)   AS event_date,
    minState(timestamp) AS started_at,
    maxState(timestamp) AS ended_at
FROM analytics.events
GROUP BY project_id, session_id, player_id, event_date;
```

Note: materialized views only aggregate rows inserted **after** they are created. Existing rows in `analytics.events` are not backfilled automatically (acceptable for dev; document for prod). Session duration uses `max(timestamp) - min(timestamp)` across all session events — it is underestimated when no late/`session_end` event is sent.

- [ ] **Step 2: Create the standalone migration file**

Create `packages/db/clickhouse/migrations/001_phase1_views.sql` with the **exact same SQL block** as Step 1 (the four statements). This file is what gets applied to already-running ClickHouse volumes, where `init.sql` will not re-run.

- [ ] **Step 3: Apply the migration to the running container**

Ensure the stack is up (`bun run --filter @sbox-analytics/db db:start`), then apply:

```bash
docker exec -i sbox-analytics-clickhouse clickhouse-client \
  --user analytics --password "$CLICKHOUSE_PASSWORD" \
  --database analytics --multiquery \
  < packages/db/clickhouse/migrations/001_phase1_views.sql
```

Expected: no output (success). If the volume is fresh you can instead `bun run --filter @sbox-analytics/db db:down && db:start` to load via `init.sql`.

- [ ] **Step 4: Verify the views exist and are queryable**

```bash
docker exec -i sbox-analytics-clickhouse clickhouse-client \
  --user analytics --password "$CLICKHOUSE_PASSWORD" --database analytics \
  --query "SHOW TABLES FROM analytics LIKE '%_summary' OR name LIKE 'player_first_seen%'"
```

Then sanity-check a read returns rows (after sending some events through ingest, or it returns 0 rows cleanly):

```bash
docker exec -i sbox-analytics-clickhouse clickhouse-client \
  --user analytics --password "$CLICKHOUSE_PASSWORD" --database analytics \
  --query "SELECT count() FROM analytics.player_first_seen"
```

Expected: a numeric count, no error about a missing table.

- [ ] **Step 5: Commit**

```bash
git add packages/db/clickhouse/init.sql packages/db/clickhouse/migrations/001_phase1_views.sql
git commit -m "feat(db): add player_first_seen and sessions_summary materialized views"
```

---

## Task 2: Grouped project sidebar navigation

**Files:**

- Modify: `apps/web/src/components/dashboard/nav-config.ts:7-12` (the `NavItem` interface)
- Modify: `apps/web/src/components/dashboard/nav-main.tsx` (render group labels)
- Modify: `apps/web/src/features/projects/components/molecules/project-nav.tsx` (grouped entries)

Current `projectNav` returns a flat `NavItem[]`. The spec wants grouped sections (Project / Engagement / Game / Data). Add an optional `group` field to `NavItem` and render a `SidebarGroupLabel` whenever the group changes.

- [ ] **Step 1: Add optional `group` to `NavItem`**

In `nav-config.ts`, the interface currently is:

```ts
export interface NavItem {
  title: string;
  url: string;
  external?: boolean;
}
```

Add the field and an icon (icons are already used on items):

```ts
export interface NavItem {
  title: string;
  url: string;
  external?: boolean;
  group?: string;
}
```

- [ ] **Step 2: Render group labels in `NavMain`**

`nav-main.tsx` currently maps items inside a single `SidebarMenu`. Import `SidebarGroupLabel` from the same UI module the other `Sidebar*` primitives come from, and emit a label when an item's `group` differs from the previous item's group. Replace the items map body with:

```tsx
{
  items.map((item, index) => {
    const previousGroup = index > 0 ? items[index - 1].group : undefined;
    const showGroupLabel = item.group && item.group !== previousGroup;
    return (
      <Fragment key={item.title}>
        {showGroupLabel ? (
          <SidebarGroupLabel className="mt-2">{item.group}</SidebarGroupLabel>
        ) : null}
        <SidebarMenuItem>
          <SidebarMenuButton render={<Link to={item.url} />}>
            {item.icon && <item.icon />}
            <span>{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </Fragment>
    );
  });
}
```

Add `import { Fragment } from "react";` at the top, and add `SidebarGroupLabel` to the existing `@sbox-analytics/ui/components/sidebar` import in this file. (Verify the exact import path matches the other `Sidebar*` imports already in `nav-main.tsx`.)

- [ ] **Step 3: Add Phase 1 entries with groups to `projectNav`**

In `project-nav.tsx`, extend the imports and the returned array. Current items: Overview, Events, Live Events, Settings. New full list with groups (order matters — items are grouped by adjacency):

```tsx
import {
  IconActivity,
  IconChartBar,
  IconDeviceGamepad2,
  IconListDetails,
  IconMap,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import type { NavItem } from "@/components/dashboard/nav-config";

export const projectNav = (projectId: string): NavItem[] => {
  const base = `/dashboard/projects/${projectId}`;
  return [
    {
      group: "Project",
      icon: IconChartBar,
      title: "Overview",
      url: `${base}/overview`,
    },
    {
      group: "Engagement",
      icon: IconUsers,
      title: "Players",
      url: `${base}/players`,
    },
    {
      group: "Engagement",
      icon: IconDeviceGamepad2,
      title: "Sessions",
      url: `${base}/sessions`,
    },
    {
      group: "Game",
      icon: IconMap,
      title: "Maps & Modes",
      url: `${base}/maps`,
    },
    {
      group: "Data",
      icon: IconListDetails,
      title: "Events",
      url: `${base}/events`,
    },
    {
      group: "Data",
      icon: IconActivity,
      title: "Live Events",
      url: `${base}/live`,
    },
    {
      group: "Project",
      icon: IconSettings,
      title: "Settings",
      url: `${base}/settings`,
    },
  ];
};
```

Note: `NavItem` needs an `icon?: Icon` field if it does not already have one — check `nav-config.ts`. The existing flat `projectNav` already passes `icon`, so the field exists (likely on a wider type). If `NavItem` lacks `icon`, add `icon?: Icon` (import `type { Icon } from "@tabler/icons-react"`).

- [ ] **Step 4: Verify the sidebar renders without type errors**

Run: `bun run --filter @sbox-analytics/web check-types` (or the app's typecheck script).
Expected: no errors referencing `nav-config.ts`, `nav-main.tsx`, or `project-nav.tsx`. The new routes will 404 until Tasks 4/6/8 create the route files — that is expected at this step.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/nav-config.ts apps/web/src/components/dashboard/nav-main.tsx apps/web/src/features/projects/components/molecules/project-nav.tsx
git commit -m "feat(web): group project sidebar nav and add Phase 1 entries"
```

---

## Task 3: `insights.players` oRPC procedure

**Files:**

- Modify: `packages/api/src/routers/analytics.ts` (add schemas + `players` procedure to `analyticsRouter`)

Returns a daily series (DAU + new vs returning) plus trailing WAU/MAU scalars. New-vs-returning needs player-level granularity, which `events_daily` lacks, so this procedure derives the active player-day set from raw `analytics.events` and joins `player_first_seen` for the first-seen date. (Deviates from the spec's `events_daily` hint, which cannot distinguish new from returning — documented here intentionally.)

- [ ] **Step 1: Add zod schemas near the existing `dailyInput`/`eventsRow` schemas (top of file)**

```ts
const playersInput = z.object({
  from: z.iso.date(),
  projectId: z.string().min(1),
  to: z.iso.date(),
});

const playersDailyRow = z.object({
  event_date: z.string(),
  dau: z.coerce.number(),
  new_players: z.coerce.number(),
  returning_players: z.coerce.number(),
});

const playersTotalsRow = z.object({
  wau: z.coerce.number(),
  mau: z.coerce.number(),
});

const playersOutput = z.object({
  daily: z.array(playersDailyRow),
  wau: z.coerce.number(),
  mau: z.coerce.number(),
});
```

- [ ] **Step 2: Add the `players` procedure to the `analyticsRouter` object**

Insert as a new property in the `export const analyticsRouter = { ... }` object (after `daily`):

```ts
  // DAU + new-vs-returning daily series, plus trailing WAU/MAU.
  players: protectedProcedure
    .input(playersInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const ch = clickhouse();

      const dailyResult = await ch.query({
        format: "JSON",
        query: `
          WITH active AS (
            SELECT
              toDate(timestamp) AS event_date,
              player_id
            FROM analytics.events
            WHERE project_id = {projectId:String}
              AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
            GROUP BY event_date, player_id
          ),
          firsts AS (
            SELECT player_id, minMerge(first_seen) AS first_seen
            FROM analytics.player_first_seen
            WHERE project_id = {projectId:String}
            GROUP BY player_id
          )
          SELECT
            a.event_date                                   AS event_date,
            toUInt64(uniq(a.player_id))                    AS dau,
            toUInt64(uniqIf(a.player_id, f.first_seen = a.event_date)) AS new_players,
            toUInt64(uniqIf(a.player_id, f.first_seen < a.event_date)) AS returning_players
          FROM active AS a
          LEFT JOIN firsts AS f USING (player_id)
          GROUP BY a.event_date
          ORDER BY a.event_date
        `,
        query_params: input,
      });
      const dailyJson = await dailyResult.json<z.infer<typeof playersDailyRow>>();
      const daily = z.array(playersDailyRow).parse(dailyJson.data);

      const totalsResult = await ch.query({
        format: "JSON",
        query: `
          SELECT
            toUInt64(uniqIf(player_id, timestamp >= {to:Date} - INTERVAL 7 DAY))  AS wau,
            toUInt64(uniqIf(player_id, timestamp >= {to:Date} - INTERVAL 30 DAY)) AS mau
          FROM analytics.events
          WHERE project_id = {projectId:String}
            AND toDate(timestamp) BETWEEN ({to:Date} - INTERVAL 30 DAY) AND {to:Date}
        `,
        query_params: input,
      });
      const totalsJson = await totalsResult.json<z.infer<typeof playersTotalsRow>>();
      const totals = z.array(playersTotalsRow).parse(totalsJson.data)[0] ?? {
        wau: 0,
        mau: 0,
      };

      return playersOutput.parse({ daily, wau: totals.wau, mau: totals.mau });
    }),
```

- [ ] **Step 3: Verify it typechecks**

Run: `bun run --filter @sbox-analytics/api check-types` (or the repo-wide typecheck).
Expected: no errors in `analytics.ts`.

- [ ] **Step 4: Manual verification against ClickHouse**

With the dev stack up and some events ingested (or zero), call the query directly to confirm the SQL is valid:

```bash
docker exec -i sbox-analytics-clickhouse clickhouse-client \
  --user analytics --password "$CLICKHOUSE_PASSWORD" --database analytics --multiquery --query "
  WITH active AS (
    SELECT toDate(timestamp) AS event_date, player_id FROM analytics.events
    WHERE project_id = 'demo' GROUP BY event_date, player_id
  ), firsts AS (
    SELECT player_id, minMerge(first_seen) AS first_seen FROM analytics.player_first_seen
    WHERE project_id = 'demo' GROUP BY player_id
  )
  SELECT a.event_date, uniq(a.player_id) dau,
    uniqIf(a.player_id, f.first_seen = a.event_date) new_players,
    uniqIf(a.player_id, f.first_seen < a.event_date) returning_players
  FROM active a LEFT JOIN firsts f USING (player_id)
  GROUP BY a.event_date ORDER BY a.event_date"
```

Expected: returns rows (or empty) with no SQL syntax/type error.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/analytics.ts
git commit -m "feat(api): add insights.players procedure (DAU/WAU/MAU + new vs returning)"
```

---

## Task 4: `/players` view + route

**Files:**

- Create: `apps/web/src/features/analytics/components/organisms/players-view.tsx`
- Create: `apps/web/src/routes/dashboard/projects/$projectId/players.tsx`

Follows the `overview-view.tsx` pattern exactly: `useQuery` → loading Skeletons → error message → render. Renders WAU/MAU metric cards, a DAU area chart, and a stacked bar of new vs returning players.

- [ ] **Step 1: Create the view organism**

```tsx
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";

import { isoDaysAgo } from "../../lib/date-window";
import { MetricCard } from "../molecules/metric-card";

const PLAYERS_WINDOW_DAYS = 30;

export const PlayersView = ({ projectId }: { projectId: string }) => {
  const query = useQuery(
    orpc.insights.players.queryOptions({
      input: {
        from: isoDaysAgo(PLAYERS_WINDOW_DAYS),
        projectId,
        to: isoDaysAgo(0),
      },
    })
  );

  if (query.isLoading) {
    const cardKeys = Array.from({ length: 2 }, (_, index) => `card-${index}`);
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {cardKeys.map((key) => (
            <Skeleton className="h-24 w-full" key={key} />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">Failed to load players.</div>
    );
  }

  const data = query.data ?? { daily: [], mau: 0, wau: 0 };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="font-semibold text-2xl">Players</h1>
        <p className="text-muted-foreground">
          Last {PLAYERS_WINDOW_DAYS} days.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          label="WAU (last 7 days)"
          value={data.wau.toLocaleString()}
        />
        <MetricCard
          label="MAU (last 30 days)"
          value={data.mau.toLocaleString()}
        />
      </div>

      {data.daily.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">Daily active players</h2>
          <ResponsiveContainer height={240} width="100%">
            <AreaChart data={data.daily}>
              <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Area
                dataKey="dau"
                fill="var(--primary)"
                fillOpacity={0.2}
                stroke="var(--primary)"
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {data.daily.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">New vs returning</h2>
          <ResponsiveContainer height={240} width="100%">
            <BarChart data={data.daily}>
              <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="new_players"
                fill="var(--primary)"
                name="New"
                stackId="p"
              />
              <Bar
                dataKey="returning_players"
                fill="var(--muted-foreground)"
                name="Returning"
                stackId="p"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
};
```

- [ ] **Step 2: Create the route file**

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { PlayersView } from "@/features/analytics/components/organisms/players-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/players")({
  component: PlayersPage,
});

function PlayersPage() {
  const { projectId } = Route.useParams();
  return <PlayersView projectId={projectId} />;
}
```

- [ ] **Step 3: Regenerate the route tree + typecheck**

Run `bun run --filter @sbox-analytics/web dev` briefly (regenerates `routeTree.gen.ts`) or the build/typecheck script. Do NOT hand-edit `routeTree.gen.ts`.
Expected: `routeTree.gen.ts` now references the players route; typecheck passes.

- [ ] **Step 4: Manual verification in the browser**

Open `/dashboard/projects/<id>/players`. Expected: page renders with WAU/MAU cards; charts render if data exists, otherwise the cards show and chart sections are hidden. Sidebar "Players" link (Task 2) navigates here.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/analytics/components/organisms/players-view.tsx apps/web/src/routes/dashboard/projects/\$projectId/players.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(web): add /players route and view"
```

---

## Task 5: `insights.sessions` oRPC procedure

**Files:**

- Modify: `packages/api/src/routers/analytics.ts` (add schemas + `sessions` procedure)

Derives one row per session from `sessions_summary` (duration = `dateDiff('second', minMerge(started_at), maxMerge(ended_at))`), then returns a duration histogram, an avg-duration daily trend, and an hour×weekday heatmap.

- [ ] **Step 1: Add zod schemas (top of file)**

```ts
const sessionsInput = z.object({
  from: z.iso.date(),
  projectId: z.string().min(1),
  to: z.iso.date(),
});

const sessionsHistogramRow = z.object({
  bucket: z.string(),
  sort: z.coerce.number(),
  sessions: z.coerce.number(),
});

const sessionsTrendRow = z.object({
  event_date: z.string(),
  avg_seconds: z.coerce.number(),
});

const sessionsHeatmapRow = z.object({
  weekday: z.coerce.number(),
  hour: z.coerce.number(),
  sessions: z.coerce.number(),
});

const sessionsOutput = z.object({
  histogram: z.array(sessionsHistogramRow),
  trend: z.array(sessionsTrendRow),
  heatmap: z.array(sessionsHeatmapRow),
});
```

- [ ] **Step 2: Add the `sessions` procedure to `analyticsRouter`**

```ts
  // Session duration histogram, avg-duration trend, and time-of-day heatmap.
  sessions: protectedProcedure
    .input(sessionsInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const ch = clickhouse();
      const sessionsCte = `
        WITH sessions AS (
          SELECT
            session_id,
            event_date,
            minMerge(started_at) AS started_at,
            dateDiff('second', minMerge(started_at), maxMerge(ended_at)) AS duration
          FROM analytics.sessions_summary
          WHERE project_id = {projectId:String}
            AND event_date BETWEEN {from:Date} AND {to:Date}
          GROUP BY session_id, event_date
        )`;

      const histogramResult = await ch.query({
        format: "JSON",
        query: `${sessionsCte}
          SELECT
            multiIf(duration < 60, '0-1m',
                    duration < 300, '1-5m',
                    duration < 900, '5-15m',
                    duration < 1800, '15-30m', '30m+') AS bucket,
            multiIf(duration < 60, 0,
                    duration < 300, 1,
                    duration < 900, 2,
                    duration < 1800, 3, 4)              AS sort,
            toUInt64(count())                            AS sessions
          FROM sessions
          GROUP BY bucket, sort
          ORDER BY sort
        `,
        query_params: input,
      });
      const histogramJson =
        await histogramResult.json<z.infer<typeof sessionsHistogramRow>>();
      const histogram = z
        .array(sessionsHistogramRow)
        .parse(histogramJson.data);

      const trendResult = await ch.query({
        format: "JSON",
        query: `${sessionsCte}
          SELECT
            toString(event_date)        AS event_date,
            toUInt64(round(avg(duration))) AS avg_seconds
          FROM sessions
          GROUP BY event_date
          ORDER BY event_date
        `,
        query_params: input,
      });
      const trendJson = await trendResult.json<z.infer<typeof sessionsTrendRow>>();
      const trend = z.array(sessionsTrendRow).parse(trendJson.data);

      const heatmapResult = await ch.query({
        format: "JSON",
        query: `${sessionsCte}
          SELECT
            toUInt8(toDayOfWeek(started_at)) AS weekday,
            toUInt8(toHour(started_at))      AS hour,
            toUInt64(count())                AS sessions
          FROM sessions
          GROUP BY weekday, hour
          ORDER BY weekday, hour
        `,
        query_params: input,
      });
      const heatmapJson =
        await heatmapResult.json<z.infer<typeof sessionsHeatmapRow>>();
      const heatmap = z.array(sessionsHeatmapRow).parse(heatmapJson.data);

      return sessionsOutput.parse({ histogram, trend, heatmap });
    }),
```

- [ ] **Step 3: Typecheck**

Run: `bun run --filter @sbox-analytics/api check-types`. Expected: no errors.

- [ ] **Step 4: Manual verification**

Run the histogram query directly via `clickhouse-client` (substitute a real `project_id`, `from`, `to`) to confirm valid SQL:

```bash
docker exec -i sbox-analytics-clickhouse clickhouse-client \
  --user analytics --password "$CLICKHOUSE_PASSWORD" --database analytics --multiquery --query "
  WITH sessions AS (
    SELECT session_id, event_date,
      dateDiff('second', minMerge(started_at), maxMerge(ended_at)) AS duration
    FROM analytics.sessions_summary WHERE project_id='demo'
    GROUP BY session_id, event_date)
  SELECT multiIf(duration<60,'0-1m',duration<300,'1-5m',duration<900,'5-15m',duration<1800,'15-30m','30m+') bucket, count() FROM sessions GROUP BY bucket"
```

Expected: rows or empty, no error.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/analytics.ts
git commit -m "feat(api): add insights.sessions procedure (histogram + trend + heatmap)"
```

---

## Task 6: Heatmap helper (TDD) + `/sessions` view + route

**Files:**

- Create: `apps/web/src/features/analytics/lib/heatmap.ts`
- Create: `apps/web/src/features/analytics/lib/heatmap.test.ts`
- Create: `apps/web/src/features/analytics/components/organisms/sessions-view.tsx`
- Create: `apps/web/src/routes/dashboard/projects/$projectId/sessions.tsx`

`buildHeatmapGrid` turns the sparse `{weekday, hour, sessions}` cells from `insights.sessions` into a dense 7×24 matrix (weekday 1=Mon..7=Sun per ClickHouse `toDayOfWeek`) for rendering. This pure function is unit-tested.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/analytics/lib/heatmap.test.ts`:

```ts
import { describe, expect, it } from "bun:test";

import { buildHeatmapGrid } from "./heatmap";

describe("buildHeatmapGrid", () => {
  it("fills a 7x24 grid with zeros for missing cells", () => {
    const grid = buildHeatmapGrid([]);
    expect(grid.rows).toHaveLength(7);
    expect(grid.rows[0].cells).toHaveLength(24);
    expect(grid.rows[0].cells[0]).toBe(0);
    expect(grid.max).toBe(0);
  });

  it("places counts at the correct weekday/hour and tracks the max", () => {
    const grid = buildHeatmapGrid([
      { weekday: 1, hour: 0, sessions: 5 },
      { weekday: 7, hour: 23, sessions: 9 },
    ]);
    expect(grid.rows[0].cells[0]).toBe(5);
    expect(grid.rows[6].cells[23]).toBe(9);
    expect(grid.max).toBe(9);
  });

  it("ignores out-of-range cells defensively", () => {
    const grid = buildHeatmapGrid([{ weekday: 0, hour: 99, sessions: 3 }]);
    expect(grid.max).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `bun test apps/web/src/features/analytics/lib/heatmap.test.ts`
Expected: FAIL — cannot find module `./heatmap` / `buildHeatmapGrid` is not defined.

- [ ] **Step 3: Implement the helper**

`apps/web/src/features/analytics/lib/heatmap.ts`:

```ts
export type HeatmapCell = { weekday: number; hour: number; sessions: number };

export type HeatmapGrid = {
  rows: { weekday: number; cells: number[] }[];
  max: number;
};

const DAYS = 7;
const HOURS = 24;

export const buildHeatmapGrid = (cells: HeatmapCell[]): HeatmapGrid => {
  const rows = Array.from({ length: DAYS }, (_, dayIndex) => ({
    weekday: dayIndex + 1,
    cells: Array.from({ length: HOURS }, () => 0),
  }));

  let max = 0;
  for (const cell of cells) {
    const dayIndex = cell.weekday - 1;
    const isValid =
      dayIndex >= 0 && dayIndex < DAYS && cell.hour >= 0 && cell.hour < HOURS;
    if (!isValid) {
      continue;
    }
    rows[dayIndex].cells[cell.hour] = cell.sessions;
    if (cell.sessions > max) {
      max = cell.sessions;
    }
  }

  return { rows, max };
};
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bun test apps/web/src/features/analytics/lib/heatmap.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the `/sessions` view organism**

```tsx
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";

import { isoDaysAgo } from "../../lib/date-window";
import { buildHeatmapGrid } from "../../lib/heatmap";

const SESSIONS_WINDOW_DAYS = 30;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SessionsView = ({ projectId }: { projectId: string }) => {
  const query = useQuery(
    orpc.insights.sessions.queryOptions({
      input: {
        from: isoDaysAgo(SESSIONS_WINDOW_DAYS),
        projectId,
        to: isoDaysAgo(0),
      },
    })
  );

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">
        Failed to load sessions.
      </div>
    );
  }

  const data = query.data ?? { histogram: [], trend: [], heatmap: [] };
  const grid = buildHeatmapGrid(data.heatmap);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="font-semibold text-2xl">Sessions</h1>
        <p className="text-muted-foreground">
          Last {SESSIONS_WINDOW_DAYS} days.
        </p>
      </div>

      {data.histogram.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">Session duration</h2>
          <ResponsiveContainer height={240} width="100%">
            <BarChart data={data.histogram}>
              <XAxis dataKey="bucket" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Bar dataKey="sessions" fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {data.trend.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">
            Avg session duration (seconds)
          </h2>
          <ResponsiveContainer height={240} width="100%">
            <LineChart data={data.trend}>
              <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Line
                dataKey="avg_seconds"
                dot={false}
                stroke="var(--primary)"
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-4 font-medium text-sm">
          Activity by hour and weekday
        </h2>
        <div className="flex flex-col gap-1">
          {grid.rows.map((row, rowIndex) => (
            <div className="flex items-center gap-1" key={row.weekday}>
              <span className="w-8 text-muted-foreground text-xs">
                {WEEKDAY_LABELS[rowIndex]}
              </span>
              <div className="flex gap-0.5">
                {row.cells.map((count, hour) => (
                  <div
                    className="h-3 w-3 rounded-[2px]"
                    key={`${row.weekday}-${hour}`}
                    style={{
                      backgroundColor: "var(--primary)",
                      opacity:
                        grid.max > 0 ? 0.1 + (count / grid.max) * 0.9 : 0.1,
                    }}
                    title={`${WEEKDAY_LABELS[rowIndex]} ${hour}:00 — ${count} sessions`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 6: Create the route file**

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { SessionsView } from "@/features/analytics/components/organisms/sessions-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/sessions")(
  {
    component: SessionsPage,
  }
);

function SessionsPage() {
  const { projectId } = Route.useParams();
  return <SessionsView projectId={projectId} />;
}
```

- [ ] **Step 7: Typecheck + browser verification**

Run dev (regenerates `routeTree.gen.ts`) + typecheck. Open `/dashboard/projects/<id>/sessions`. Expected: histogram, trend line, and a 7×24 opacity heatmap render; empty state hides charts but the heatmap grid still shows (all faint).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/analytics/lib/heatmap.ts apps/web/src/features/analytics/lib/heatmap.test.ts apps/web/src/features/analytics/components/organisms/sessions-view.tsx apps/web/src/routes/dashboard/projects/\$projectId/sessions.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(web): add /sessions route, view, and tested heatmap helper"
```

---

## Task 7: `insights.maps` oRPC procedure

**Files:**

- Modify: `packages/api/src/routers/analytics.ts` (add schemas + `maps` procedure)

Each session's map comes from its `session_start` event (`JSONExtractString(properties, 'map')`). Joins `sessions_summary` for per-map avg duration. Returns a per-map breakdown (sessions, players, avg duration) and a per-day popularity series.

- [ ] **Step 1: Add zod schemas (top of file)**

```ts
const mapsInput = z.object({
  from: z.iso.date(),
  projectId: z.string().min(1),
  to: z.iso.date(),
});

const mapsBreakdownRow = z.object({
  map: z.string(),
  sessions: z.coerce.number(),
  players: z.coerce.number(),
  avg_seconds: z.coerce.number(),
});

const mapsOverTimeRow = z.object({
  event_date: z.string(),
  map: z.string(),
  sessions: z.coerce.number(),
});

const mapsOutput = z.object({
  breakdown: z.array(mapsBreakdownRow),
  overTime: z.array(mapsOverTimeRow),
});
```

- [ ] **Step 2: Add the `maps` procedure to `analyticsRouter`**

```ts
  // Per-map/mode breakdown derived from session_start events.
  maps: protectedProcedure
    .input(mapsInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const ch = clickhouse();
      const mapsCte = `
        WITH session_maps AS (
          SELECT
            session_id,
            argMin(JSONExtractString(properties, 'map'), timestamp) AS map,
            any(player_id)        AS player_id,
            min(toDate(timestamp)) AS event_date
          FROM analytics.events
          WHERE project_id = {projectId:String}
            AND event_type = 'session_start'
            AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
          GROUP BY session_id
        ),
        durations AS (
          SELECT
            session_id,
            dateDiff('second', minMerge(started_at), maxMerge(ended_at)) AS duration
          FROM analytics.sessions_summary
          WHERE project_id = {projectId:String}
            AND event_date BETWEEN {from:Date} AND {to:Date}
          GROUP BY session_id
        )`;

      const breakdownResult = await ch.query({
        format: "JSON",
        query: `${mapsCte}
          SELECT
            m.map                            AS map,
            toUInt64(uniq(m.session_id))     AS sessions,
            toUInt64(uniq(m.player_id))      AS players,
            toUInt64(round(avg(d.duration))) AS avg_seconds
          FROM session_maps AS m
          LEFT JOIN durations AS d USING (session_id)
          WHERE m.map != ''
          GROUP BY m.map
          ORDER BY sessions DESC
          LIMIT 50
        `,
        query_params: input,
      });
      const breakdownJson =
        await breakdownResult.json<z.infer<typeof mapsBreakdownRow>>();
      const breakdown = z.array(mapsBreakdownRow).parse(breakdownJson.data);

      const overTimeResult = await ch.query({
        format: "JSON",
        query: `${mapsCte}
          SELECT
            toString(event_date)         AS event_date,
            map                          AS map,
            toUInt64(uniq(session_id))   AS sessions
          FROM session_maps
          WHERE map != ''
          GROUP BY event_date, map
          ORDER BY event_date, sessions DESC
        `,
        query_params: input,
      });
      const overTimeJson =
        await overTimeResult.json<z.infer<typeof mapsOverTimeRow>>();
      const overTime = z.array(mapsOverTimeRow).parse(overTimeJson.data);

      return mapsOutput.parse({ breakdown, overTime });
    }),
```

Note: assumes the SDK sends a `session_start` event carrying a `map` property. If a project never sends `session_start`, `breakdown` is empty — the view handles this with an empty state. This is acceptable per the spec ("`events` (raw)… acceptable at this scale").

- [ ] **Step 3: Typecheck**

Run: `bun run --filter @sbox-analytics/api check-types`. Expected: no errors.

- [ ] **Step 4: Manual verification**

```bash
docker exec -i sbox-analytics-clickhouse clickhouse-client \
  --user analytics --password "$CLICKHOUSE_PASSWORD" --database analytics --multiquery --query "
  SELECT JSONExtractString(properties,'map') map, uniq(session_id) sessions
  FROM analytics.events WHERE project_id='demo' AND event_type='session_start'
  GROUP BY map ORDER BY sessions DESC LIMIT 10"
```

Expected: rows or empty, no error.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/analytics.ts
git commit -m "feat(api): add insights.maps procedure (per-map breakdown + popularity)"
```

---

## Task 8: `/maps` view + route

**Files:**

- Create: `apps/web/src/features/analytics/components/organisms/maps-view.tsx`
- Create: `apps/web/src/routes/dashboard/projects/$projectId/maps.tsx`

Renders a sessions-per-map bar chart, a breakdown table (sessions, players, avg duration), and a popularity-over-time multi-line chart pivoted to the top 5 maps. The pivot is done inline (mirrors the inline reshaping in `overview-view.tsx`).

- [ ] **Step 1: Create the view organism**

```tsx
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";

import { isoDaysAgo } from "../../lib/date-window";

const MAPS_WINDOW_DAYS = 30;
const TOP_MAPS_FOR_TREND = 5;
const LINE_COLORS = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
};

export const MapsView = ({ projectId }: { projectId: string }) => {
  const query = useQuery(
    orpc.insights.maps.queryOptions({
      input: {
        from: isoDaysAgo(MAPS_WINDOW_DAYS),
        projectId,
        to: isoDaysAgo(0),
      },
    })
  );

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">Failed to load maps.</div>
    );
  }

  const data = query.data ?? { breakdown: [], overTime: [] };

  if (data.breakdown.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <div>
          <h1 className="font-semibold text-2xl">Maps & Modes</h1>
          <p className="text-muted-foreground">Last {MAPS_WINDOW_DAYS} days.</p>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapIcon />
            </EmptyMedia>
            <EmptyTitle>No map data yet</EmptyTitle>
            <EmptyDescription>
              Send <code>session_start</code> events with a <code>map</code>{" "}
              property to populate this view.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const topMaps = data.breakdown
    .slice(0, TOP_MAPS_FOR_TREND)
    .map((row) => row.map);

  const trendByDate = new Map<string, Record<string, number | string>>();
  for (const row of data.overTime) {
    if (!topMaps.includes(row.map)) {
      continue;
    }
    const existing = trendByDate.get(row.event_date) ?? {
      event_date: row.event_date,
    };
    existing[row.map] = row.sessions;
    trendByDate.set(row.event_date, existing);
  }
  const trend = [...trendByDate.values()].toSorted((a, b) =>
    String(a.event_date).localeCompare(String(b.event_date))
  );

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="font-semibold text-2xl">Maps & Modes</h1>
        <p className="text-muted-foreground">Last {MAPS_WINDOW_DAYS} days.</p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-4 font-medium text-sm">Sessions per map</h2>
        <ResponsiveContainer height={240} width="100%">
          <BarChart data={data.breakdown}>
            <XAxis dataKey="map" fontSize={12} tickLine={false} />
            <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
            <Tooltip />
            <Bar dataKey="sessions" fill="var(--primary)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-3 font-medium text-sm">Map breakdown</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2 font-medium">Map</th>
              <th className="pb-2 text-right font-medium">Sessions</th>
              <th className="pb-2 text-right font-medium">Players</th>
              <th className="pb-2 text-right font-medium">Avg duration</th>
            </tr>
          </thead>
          <tbody>
            {data.breakdown.map((row) => (
              <tr className="border-border border-t" key={row.map}>
                <td className="py-2 font-medium">{row.map}</td>
                <td className="py-2 text-right tabular-nums">
                  {row.sessions.toLocaleString()}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {row.players.toLocaleString()}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatDuration(row.avg_seconds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {trend.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">
            Map popularity over time (top {TOP_MAPS_FOR_TREND})
          </h2>
          <ResponsiveContainer height={240} width="100%">
            <LineChart data={trend}>
              <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Legend />
              {topMaps.map((map, index) => (
                <Line
                  dataKey={map}
                  dot={false}
                  key={map}
                  stroke={LINE_COLORS[index % LINE_COLORS.length]}
                  type="monotone"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
};
```

- [ ] **Step 2: Create the route file**

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { MapsView } from "@/features/analytics/components/organisms/maps-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/maps")({
  component: MapsPage,
});

function MapsPage() {
  const { projectId } = Route.useParams();
  return <MapsView projectId={projectId} />;
}
```

- [ ] **Step 3: Typecheck + browser verification**

Run dev (regenerates `routeTree.gen.ts`) + typecheck. Open `/dashboard/projects/<id>/maps`. Expected: with map data — bar chart, table, and top-5 line chart; without — the empty state with the `session_start`/`map` hint.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/analytics/components/organisms/maps-view.tsx apps/web/src/routes/dashboard/projects/\$projectId/maps.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat(web): add /maps route and view"
```

---

## Task 9: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole repo**

Run: `bun run check-types` (root) or per-package: `bun run --filter @sbox-analytics/api check-types && bun run --filter @sbox-analytics/web check-types`.
Note: web's `check-types` is `vite build && tsc --noEmit`, so it also regenerates `routeTree.gen.ts` and proves the build is green.
Expected: no type errors.

- [ ] **Step 2: Run the unit tests**

Run: `bun test apps/web/src/features/analytics/lib/heatmap.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Lint/format**

Run: `bun x ultracite check` then `bun x ultracite fix` if needed.
Expected: clean (or auto-fixed).

- [ ] **Step 4: Manual smoke test of all three routes**

With the dev stack up (`bun run --filter @sbox-analytics/db db:start`) and `bun run --filter @sbox-analytics/web dev`:

- Visit `/dashboard/projects/<id>/players` — WAU/MAU cards + DAU area + new/returning bars.
- Visit `/dashboard/projects/<id>/sessions` — duration histogram + avg-duration line + 7×24 heatmap.
- Visit `/dashboard/projects/<id>/maps` — sessions-per-map bar + breakdown table + popularity lines (or empty state).
- Confirm the sidebar shows grouped sections: Project / Engagement (Players, Sessions) / Game (Maps & Modes) / Data (Events, Live Events) / Project (Settings).

Expected: each route loads without console errors; empty states show cleanly when a project has no data.

- [ ] **Step 5: Final commit (if any lint fixes were applied)**

```bash
git add -A
git commit -m "chore: lint/format Phase 1 analytics routes"
```

---

## Design Decisions & Deviations (read before implementing)

- **New-vs-returning uses raw `events`, not `events_daily`.** The spec's data-source table suggests `events_daily` for `/players`, but that table is aggregated without `player_id`, so it cannot classify players as new vs returning. Tasks 3 derives the active player-day set from raw `events` joined to `player_first_seen`. Same result, correct granularity.
- **WAU/MAU are trailing-window scalars, not a rolling line.** A rolling 7/30-day unique line requires per-day windowed `uniqMerge`, which is heavier. Phase 1 ships DAU as the daily line and WAU/MAU as headline metric cards. A rolling series can be added later without schema changes.
- **Materialized views are not backfilled.** `player_first_seen` and `sessions_summary` only capture events inserted after the MV exists. For dev, re-ingest sample events or `db:down && db:start`. For prod, a one-time `INSERT INTO ... SELECT` backfill from `analytics.events` is a follow-up (out of Phase 1 scope).
- **Chart colors:** the multi-line maps chart uses `var(--chart-2..5)` directly. These resolve to `oklch(...)` color values in `packages/ui/src/styles/globals.css`. Do NOT wrap them in `hsl(...)` (some legacy template code does `hsl(var(--chart-2))`, which is stale and would be invalid against the oklch values).
- **`session_start` + `map` property is assumed** for `/maps`. If absent, `/maps` shows an empty state — no error. This matches the SDK event contract direction but is not yet guaranteed by every game.

---

## Self-Review (performed against the spec)

- **Spec coverage:** `/players` (DAU + new vs returning + growth) → Tasks 3–4. `/sessions` (duration histogram, avg trend, hour×weekday heatmap) → Tasks 5–6. `/maps` (distribution, sessions per map, avg duration per map, popularity over time) → Tasks 7–8. Both MVs (`player_first_seen`, `sessions_summary`) → Task 1. Nav grouping → Task 2. Verification → Task 9. Phase 2/3 routes (`retention`, `funnels`, `performance`, `players/$playerId`) and the `/events` enhancement / RPC events are intentionally out of this plan (separate future plans).
- **Type consistency:** procedure names (`players`/`sessions`/`maps`) match between Tasks 3/5/7 and the client calls in Tasks 4/6/8 (`orpc.insights.<name>`). Output shapes (`{daily,wau,mau}`, `{histogram,trend,heatmap}`, `{breakdown,overTime}`) match exactly what each view consumes. `buildHeatmapGrid`'s signature is identical in test, impl, and the sessions view.
- **Placeholder scan:** every code step contains complete code; SQL, schemas, components, and route files are all spelled out. No TBD/TODO/"similar to" references.
