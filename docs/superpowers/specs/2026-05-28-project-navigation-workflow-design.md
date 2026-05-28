# Project Navigation Workflow — Design

**Date:** 2026-05-28
**Status:** Approved (pending implementation plan)

## Goal

Introduce a clear distinction between **organization-level navigation** (managing
games, teams, future cross-project dashboards) and **project-level navigation**
(analyzing a single game's player behavior, events, and SDK integration).

When a user opens a project, the sidebar switches from org mode to a
project-specific mode that surfaces per-project analytics pages and a Back button
to return to the organization workspace.

## Scope

In scope:

- Route-driven org ↔ project sidebar mode switch with a Back button.
- Project-scoped route structure (layout + nested pages).
- Four **core** project pages backed by real data: Overview, Events, Live Events,
  Settings.
- One new ClickHouse aggregation procedure (`analytics.events`) to back the
  Events page.
- Add an `environment` field to the Project model and surface it in the create
  flow and on project cards.
- Derived project metadata on the Projects list (SDK status, recent activity).

Out of scope (deferred to later specs, each its own spec → plan → build cycle):

- The remaining project pages: Players, Sessions, Levels, Progression, Funnels,
  Retention, Monetization, Economy, Properties, Builds/Versions.
- A `platform` field on projects.
- Cross-project Dashboard customization.
- Team management features (invites, roles, permissions).
- Automated test harness (none exists in the repo today; verification is manual +
  `bun x ultracite check` and typecheck).

## Current State (as explored)

- `apps/web` uses TanStack Router (file-based) with all authenticated routes under
  `/dashboard`. `routes/dashboard.tsx` is the layout: `SidebarProvider` +
  `AppSidebar` + `<Outlet/>`.
- `components/dashboard/app-sidebar.tsx` renders a hardcoded `data` object from the
  stock shadcn dashboard template: `navMain` (Dashboard, Projects, Analytics,
  Team), `documents` (Data Library, Reports, Word Assistant — template leftovers),
  `navSecondary` (Settings, Get Help, Search). Most links point at `/dashboard`.
- `routes/dashboard/projects/index.tsx` lists projects + create dialog.
- `routes/dashboard/projects/$projectId.tsx` is a leaf rendering a Back link,
  project name, slug, and `ApiKeysSection`.
- Project model (`packages/db/prisma/schema/project.prisma`):
  `id, slug, name, organizationId, createdAt, updatedAt, apiKeys[]`. No
  `platform`, `environment`, or SDK-status fields.
- `ApiKey` model includes `lastUsedAt` and `revokedAt`.
- API routers (`packages/api/src/routers`): `analytics.daily`, `analytics.recent`,
  `customAnalytics.query`, `projects.{create,delete,get,list}`, `apiKeys.*`.
  - `analytics.daily` returns rows of
    `{ event_date, event_type, event_count, unique_players, unique_sessions }`.
  - `analytics.recent` returns recent raw events
    (`event_type, timestamp, session_id, player_id, properties`).
  - `projects.list` returns projects ordered by `createdAt desc` with active API
    key count.
- No test files exist in `apps/web` or `packages/api`.

## Architecture — Route-Driven Mode Switch (Approach A)

The sidebar derives its mode from the active route; the URL is the single source of
truth. No nav-mode context/state, so deep links and refreshes work without
rehydration.

### Route structure

Convert the project leaf into a layout route with nested children:

```
routes/dashboard/projects/
  $projectId.tsx              layout: loader fetches projects.get(projectId);
                              renders <Outlet/>; on NOT_FOUND/forbidden →
                              redirect('/dashboard/projects') + toast
  $projectId/index.tsx        redirect to ./overview (default landing page)
  $projectId/overview.tsx     Overview  (analytics.daily)
  $projectId/events.tsx       Events    (analytics.events — new)
  $projectId/live.tsx         Live Events (analytics.recent, polled)
  $projectId/settings.tsx     Settings  (ApiKeysSection + environment + SDK snippet)
```

Resulting URLs: `/dashboard/projects/:id/{overview,events,live,settings}`.
The existing `$projectId.tsx` content (name + `ApiKeysSection`) moves: name into the
sidebar/layout header, `ApiKeysSection` into the Settings page.

### Sidebar refactor (`app-sidebar.tsx`)

- Remove the hardcoded `data` blob and template stubs (Data Library, Reports, Word
  Assistant, the placeholder "Analytics" item).
- Detect project mode via `useRouterState` matching the
  `/dashboard/projects/$projectId` route and extracting `projectId`.
- **Org mode** — header: `OrgSwitcher`; primary nav: Dashboard, Projects, Team;
  secondary: Settings, Get Help.
- **Project mode** — header: Back button (→ `/dashboard/projects`) + project name +
  environment badge; primary nav: Overview, Events, Live Events, Settings.
- New module `components/dashboard/nav-config.ts` exports `orgNav`; the
  project nav list lives with the projects feature as
  `features/projects/components/molecules/project-nav.tsx` (exports
  `projectNav(projectId)`), so deferred pages are added in one domain-owned place.
- New component `features/projects/components/molecules/project-nav-header.tsx`
  for the Back + name + environment-badge header rendered in project mode.
- `app-sidebar.tsx` and `NavMain` remain generic app-shell chrome in
  `components/dashboard/`; they only orchestrate which org/project pieces render.
  `NavMain` is reused for both modes by passing `items`. Active highlighting via
  TanStack `Link` active state.

See the **Feature Architecture & File Map** section for the full placement of all
new project-domain UI.

## Data Model — add `environment`

In `packages/db/prisma/schema/project.prisma`:

```prisma
enum ProjectEnvironment {
  Development
  Staging
  Production
}

model Project {
  // ...existing fields...
  environment ProjectEnvironment @default(Development)
}
```

Generate a Prisma migration. Then:

- `projects.create` input gains optional `environment` (default `Development`).
- `projects.list` and `projects.get` return `environment`.
- `create-project-dialog` adds an environment Select (defaults to Development).

## Projects List / Cards — derived metadata

Extend `projects.list` to also select each project's active API keys with
`lastUsedAt`. Each card shows:

- **Name**, **environment** badge, **created date**.
- **SDK status** (derived, no extra ClickHouse call):
  - `No API key` — no active key.
  - `Awaiting data` — active key exists but every `lastUsedAt` is null.
  - `Connected` — at least one key has `lastUsedAt` set.
- **Recent activity** — max `lastUsedAt` across active keys, rendered as relative
  time (e.g. "3h ago"); "—" when none.

Rationale: deriving status/activity from API-key usage avoids an N-query
ClickHouse fan-out on the list. A ClickHouse-based "last event received" timestamp
is a possible later enhancement.

## Core Page Content

### Overview (`analytics.daily`)

Metric cards computed client-side from the daily rows:

- Total Events (sum of `event_count`), Unique Players, Sessions.
- Events-by-type breakdown and a daily trend chart.
- Metrics not present in the data — Retention (D1/D7/D30), average session
  duration, DAU-over-time — render as labeled **"Coming soon"** cards. They are not
  faked.

### Events (`analytics.events` — new procedure)

Add `analytics.events`: a ClickHouse `GROUP BY event_type` aggregation over a time
window, returning `{ event_type, event_count, unique_players }` per type. The page
renders a sortable table (event name, count, unique players) with a time-window
selector. Authorization via `assertProjectAccess`, consistent with `analytics.daily`.

### Live Events (`analytics.recent`)

Live-tailing table of recent raw events with a refetch interval (~5s) and a
pause toggle. Empty state: "No events yet — connect your SDK." Useful for debugging
SDK integration during playtests.

### Settings

- Existing `ApiKeysSection` (create / rotate / revoke keys).
- Environment (display; inline edit optional — if included, via a
  `projects.update` mutation).
- A copy-paste SDK setup snippet using the project's publishable key.

## Feature Architecture & File Map

All new UI follows the established convention: **routes are thin and import feature
organisms/molecules**; domain UI lives under
`apps/web/src/features/<domain>/components/{atoms,molecules,organisms}`. Generic
app-shell chrome (sidebar frame, nav primitives) stays in
`apps/web/src/components/dashboard/`.

New feature: **`features/analytics`** — owns the project analytics page views.
Existing features extended: **`features/projects`** (nav header, project nav,
environment Select) and **`features/api-keys`** (reused as-is in Settings).

```
apps/web/src/
  components/dashboard/
    app-sidebar.tsx              ~ refactor: route-driven org/project mode switch
    nav-config.ts                + orgNav config (generic shell)
    (NavMain stays generic, reused for both modes)

  features/projects/components/
    molecules/project-nav.tsx        + projectNav(projectId) item config
    molecules/project-nav-header.tsx + Back + name + environment badge
    molecules/create-project-dialog.tsx ~ add environment Select
    molecules/project-card.tsx       ~ add environment badge, SDK status, activity
    atoms/environment-badge.tsx      + environment pill
    atoms/sdk-status-badge.tsx       + derived status pill

  features/analytics/components/
    organisms/overview-view.tsx      + Overview page body (analytics.daily)
    organisms/events-view.tsx        + Events table (analytics.events)
    organisms/live-events-view.tsx   + Live tail (analytics.recent, polled)
    molecules/metric-card.tsx        + single metric card (+ "Coming soon" variant)
    molecules/events-table.tsx       + sortable event-type table
    molecules/live-events-table.tsx  + live-tailing stream table
    atoms/relative-time.tsx          + shared relative-time label

  features/projects/components/
    organisms/project-settings-view.tsx + Settings body: composes
                                          ApiKeysSection + environment + SDK snippet

  routes/dashboard/projects/$projectId/
    overview.tsx   imports OverviewView
    events.tsx     imports EventsView
    live.tsx       imports LiveEventsView
    settings.tsx   imports ProjectSettingsView
```

Each route file only wires the loader/params and renders the corresponding feature
organism — mirroring how `routes/dashboard/projects/index.tsx` composes
`ProjectsList` + `CreateProjectDialog` today.

## Data Flow & Error Handling

- The `$projectId.tsx` layout loader calls `projects.get(projectId)`; on
  `NOT_FOUND` it redirects to `/dashboard/projects` with a toast. Authorization
  stays server-side (`assertProjectAccess` / `assertOrgMembership`).
- Pages fetch via TanStack Query + the oRPC client, scoped by `projectId`.
- Every page defines explicit loading, empty, and error states.

## Testing

No test harness exists in the repository, and this spec does not introduce one.
Verification is manual plus `bun x ultracite check` and a typecheck/build. If a
test setup is desired later it will be its own spec.

## Risks / Open Questions

- TanStack file-based routing: converting `$projectId.tsx` from a leaf to a layout
  with a children directory must be reflected in the generated route tree
  (`routeTree.gen.ts` via the plugin/`bun run` codegen).
- Environment edit in Settings depends on a `projects.update` procedure that does
  not exist yet; treat inline edit as optional and additive.
- `analytics.events` window defaults should match `analytics.daily` conventions for
  consistency.
