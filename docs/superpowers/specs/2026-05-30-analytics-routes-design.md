# Analytics Routes — Full Platform Design

**Date:** 2026-05-30
**Scope:** All analytics routes for the s&box Analytics dashboard — complete vision, build priority, data model, and component architecture.

---

## Context

The dashboard currently has one analytics route (`/overview`) showing total events, unique players, session counts, an event volume trend, and a top-events list. This spec defines every meaningful analytics surface the platform should expose, ranked by build priority, with the data model and component structure required to implement each.

The platform serves s&box game developers across two equally important jobs:

- **Growth/engagement** — how many people are playing, are they coming back
- **Game debugging/improvement** — where do players drop off, which maps work, is the game running well

---

## Complete Route Surface

All routes are nested under `/dashboard/projects/$projectId/`.

### Already Exists

| Route      | Description                                                             |
| ---------- | ----------------------------------------------------------------------- |
| `overview` | Event volume trend, totals (events, players, sessions), top event types |
| `events`   | Paginated event stream with basic filtering                             |
| `live`     | Real-time event feed                                                    |
| `settings` | API keys, project configuration                                         |

### Phase 1 — Core Behavioral Analytics

| Route      | Description                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `players`  | DAU/WAU/MAU line chart, new vs returning stacked bar, player growth trend                                     |
| `sessions` | Session duration histogram, avg duration trend, sessions-per-player distribution, hour×weekday heatmap        |
| `maps`     | Player distribution across maps/modes, sessions per map (bar), avg duration per map, map popularity over time |

### Phase 2 — Retention & Progression

| Route       | Description                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `retention` | Day-1/7/30 cohort retention curves, cohort heatmap table, churn rate trend                                             |
| `funnels`   | Visual funnel builder (user-defined event steps), drop-off % per step, conversion rate over time, saved funnel library |

### Phase 3 — Performance & Power Users

| Route               | Description                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `performance`       | FPS p50/p95/p99 line chart, crash rate trend, load time histogram, performance breakdown by map |
| `players/$playerId` | Individual player event timeline, session history, lifetime stats                               |

**Enhancement (not a new route):** `/events` gets property filter UI, time series for any custom event, and opt-in RPC event support (see RPC section below).

---

## Navigation Structure

The sidebar groups routes into three sections:

```
Project
  Overview

Engagement
  Players       [P1]
  Sessions      [P1]
  Retention     [P2]

Game
  Maps & Modes  [P1]
  Performance   [P3]
  Funnels       [P2]

Data
  Events
  Live

Project
  Settings
```

---

## Data Model

### Existing ClickHouse Tables

**`analytics.events`** — raw MergeTree, all ingested events

```
project_id   String
event_type   LowCardinality(String)
timestamp    DateTime64(3, UTC)
session_id   String
player_id    String
properties   String (JSON)
ingested_at  DateTime64(3, UTC)
ORDER BY (project_id, event_type, timestamp, session_id)
TTL 13 months
```

**`analytics.events_daily`** — AggregatingMergeTree, pre-aggregated per project/date/event_type

```
project_id      String
event_date      Date
event_type      LowCardinality(String)
unique_players  AggregateFunction(uniq, String)
unique_sessions AggregateFunction(uniq, String)
event_count     AggregateFunction(count)
ORDER BY (project_id, event_date, event_type)
```

### New Materialized Views

**`analytics.player_first_seen`** — first event date per player per project

```sql
CREATE TABLE analytics.player_first_seen (
  project_id String,
  player_id  String,
  first_seen AggregateFunction(min, Date)
) ENGINE = AggregatingMergeTree
ORDER BY (project_id, player_id);

CREATE MATERIALIZED VIEW analytics.player_first_seen_mv
TO analytics.player_first_seen AS
SELECT
  project_id,
  player_id,
  minState(toDate(timestamp)) AS first_seen
FROM analytics.events
GROUP BY project_id, player_id;
```

Powers: `/players` new vs returning, `/retention` cohort grouping.

**`analytics.sessions_summary`** — min/max timestamp per session

```sql
CREATE TABLE analytics.sessions_summary (
  project_id  String,
  session_id  String,
  player_id   String,
  event_date  Date,
  started_at  AggregateFunction(min, DateTime64(3)),
  ended_at    AggregateFunction(max, DateTime64(3))
) ENGINE = AggregatingMergeTree
ORDER BY (project_id, event_date, session_id);

CREATE MATERIALIZED VIEW analytics.sessions_summary_mv
TO analytics.sessions_summary AS
SELECT
  project_id,
  session_id,
  player_id,
  toDate(timestamp) AS event_date,
  minState(timestamp) AS started_at,
  maxState(timestamp) AS ended_at
FROM analytics.events
GROUP BY project_id, session_id, player_id, event_date;
```

Powers: `/sessions` duration histogram, avg session length, time-of-day heatmap. Note: uses `max(timestamp)` across all events in a session — no explicit `session_end` event required, but duration will be underestimated if `session_end` is never sent.

### Route → Data Source Mapping

| Route          | Primary source                       | Notes                                                                                  |
| -------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| `/players`     | `events_daily` + `player_first_seen` | uniqMerge for DAU; join first_seen for new vs returning                                |
| `/sessions`    | `sessions_summary`                   | dateDiff for duration; toHour(started_at) for heatmap                                  |
| `/maps`        | `events` (raw)                       | JSONExtractString(properties, 'map') on session_start events; acceptable at this scale |
| `/retention`   | `player_first_seen` + `events_daily` | cohort date from first_seen; return events from events_daily                           |
| `/funnels`     | `events` (raw)                       | ad-hoc window function query; sequences are user-defined, can't be pre-aggregated      |
| `/performance` | `events` (raw)                       | event_type IN ('fps_sample', 'crash', 'load_complete'); JSONExtractFloat64 for values  |

---

## Component Architecture

Each route follows the existing pattern: a thin route file delegates to a view organism.

### Route Files

```
apps/web/src/routes/dashboard/projects/$projectId/
  players.tsx
  sessions.tsx
  maps.tsx
  retention.tsx
  funnels.tsx
  performance.tsx
```

Each file is ~10 lines: `createFileRoute`, extract `projectId`, render `<XxxView projectId={projectId} />`.

### View Organisms

```
apps/web/src/features/analytics/components/organisms/
  players-view.tsx
  sessions-view.tsx
  maps-view.tsx
  retention-view.tsx
  funnels-view.tsx
  performance-view.tsx
```

Shared infrastructure already in place:

- `metric-card.tsx` — KPI stat cards
- `date-window.ts` — date range picker logic
- Recharts — all charting

### New Molecules

The funnel builder requires one new molecule:

```
apps/web/src/features/analytics/components/molecules/
  funnel-builder.tsx   — local state for user-defined event step sequence
```

All other routes compose existing molecules (metric-card, table) with Recharts primitives.

### API Procedures

One new oRPC procedure per route in `packages/api/src/routers/analytics.ts`:

```
analytics.players          — DAU/WAU/MAU + new vs returning
analytics.sessions         — duration distribution + heatmap
analytics.maps             — per-map/mode breakdown
analytics.retention        — cohort curves + heatmap table
analytics.funnels          — ad-hoc funnel query from step definitions
analytics.performance      — FPS/crash/load metrics
analytics.playerProfile    — individual player timeline (Phase 3)
```

Each procedure follows the existing `assertProjectAccess` guard pattern.

---

## RPC Events

s&box RPCs can be tracked as opt-in custom events. The C# SDK exposes an attribute:

```csharp
[Rpc.Server, Analytics.Track]
public void BuyItem(string itemId) { ... }
```

This auto-sends the RPC invocation as a `custom_event` with `event_type = "rpc:BuyItem"` and the method arguments as `properties`. No new analytics route is needed — RPC events surface in:

- `/events` — filterable by `event_type` prefix `"rpc:"`
- `/funnels` — usable as funnel steps (e.g. `JoinLobby → ReadyUp → StartGame`)
- `/players/$playerId` — appear in the individual event timeline

---

## Build Order

1. **`player_first_seen` + `sessions_summary` MVs** — unblock all Phase 1 routes
2. **`/players`** — highest universal value, lowest query complexity
3. **`/sessions`** — complements overview, same MV dependency
4. **`/maps`** — s&box differentiator, raw event query only
5. **`/retention`** — requires `player_first_seen`, more complex ClickHouse cohort query
6. **`/funnels`** — most complex UI (builder state), high value once behavioral data exists
7. **`/performance`** — Phase 3, raw event queries only
8. **`/players/$playerId`** — Phase 3, individual player drill-down
