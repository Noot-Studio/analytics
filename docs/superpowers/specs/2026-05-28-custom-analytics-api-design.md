# Custom Analytics Query API Design

## Date: 2026-05-28

## Overview

Add a flexible analytics query endpoint that lets s&box developers query their event data using a structured JSON config. Inspired by Unity Analytics, Google Analytics 4, devtodev, and Umami — all of which use structured event queries rather than raw SQL.

## Goals

- Enable custom analytics queries without exposing raw SQL
- Support filtering, grouping, and aggregation on event properties
- Generate parameterized ClickHouse queries (injection-safe)
- Type-safe API via oRPC + Zod

## Architecture

```
Dashboard (React) → oRPC client → /rpc/analytics.query
  ↓
protectedProcedure (auth + project ownership check)
  ↓
query-builder.ts (JSON config → ClickHouse SQL)
  ↓
ClickHouse {name:Type} parameterized query
  ↓
JSON response → Dashboard chart/table
```

### New Files

- `packages/api/src/routers/custom-analytics.ts` — oRPC router with query endpoint
- `packages/api/src/query-builder.ts` — Structured config → ClickHouse SQL generator

### Integration

- Register `customAnalyticsRouter` in `packages/api/src/routers/index.ts`
- No changes to `apps/server` — new routes auto-discovered via `appRouter`
- No schema changes — queries existing `analytics.events` table

## API Contract

### Request Schema (Zod)

```typescript
z.object({
  projectId: z.string().min(1),

  eventType: z.string().min(1).optional(),
  // Filter by specific event type, or omit for "all events"

  filters: z
    .array(
      z.object({
        property: z.string().min(1), // e.g. "level", "weapon"
        operator: z.enum([
          "eq",
          "neq",
          "gt",
          "gte",
          "lt",
          "lte",
          "contains",
          "starts_with",
          "in",
        ]),
        value: z.union([z.string(), z.number(), z.array(z.string())]),
      })
    )
    .max(10)
    .optional(),

  groupBy: z.array(z.string().min(1)).max(5).optional(),
  // Group by event properties (e.g. ["weapon", "map"])

  aggregation: z.enum([
    "count",
    "unique_players",
    "unique_sessions",
    "avg",
    "sum",
    "min",
    "max",
  ]),
  // What to compute

  aggregateProperty: z.string().min(1).optional(),
  // Required for avg/sum/min/max — which property to aggregate (e.g. "level", "score")

  timeRange: z.object({
    from: z.iso.date(),
    to: z.iso.date(),
  }),

  granularity: z.enum(["hour", "day", "week", "month", "none"]).default("day"),
  // Time bucketing. "none" = single total value

  limit: z.number().int().min(1).max(1000).default(100),
});
```

### Response Schema

```typescript
z.array(z.object({
  // Dimensions (only if granularity != "none")
  timestamp: z.string().optional(),

  // Dynamic based on groupBy
  [propertyName: string]: z.string().optional(),

  // Metrics
  value: z.number(),                  // The aggregated result

  // Metadata
  event_count: z.number().optional()  // Raw event count (for avg/sum context)
}))
```

### Examples

#### Deaths by weapon on de_dust2 (daily)

```json
{
  "projectId": "proj_123",
  "eventType": "player_death",
  "filters": [{ "property": "map", "operator": "eq", "value": "de_dust2" }],
  "groupBy": ["weapon"],
  "aggregation": "count",
  "timeRange": { "from": "2026-01-01", "to": "2026-01-31" },
  "granularity": "day"
}
```

#### Average player level over time (weekly)

```json
{
  "projectId": "proj_123",
  "eventType": "level_up",
  "aggregation": "avg",
  "aggregateProperty": "level",
  "granularity": "week",
  "timeRange": { "from": "2026-01-01", "to": "2026-01-31" }
}
```

#### Unique players by game mode (no time bucketing)

```json
{
  "projectId": "proj_123",
  "eventType": "session_start",
  "groupBy": ["game_mode"],
  "aggregation": "unique_players",
  "timeRange": { "from": "2026-01-01", "to": "2026-01-31" },
  "granularity": "none"
}
```

## Query Builder

### Type Detection

Since `properties` is stored as a JSON string, we auto-detect the property type from the filter value:

- `string` → `JSONExtractString(properties, 'prop')`
- `number` → `JSONExtractFloat64(properties, 'prop')`
- `array` (for `in` operator) → `JSONExtractString(properties, 'prop')`

### Filter → SQL Mapping

| Operator      | SQL                            |
| ------------- | ------------------------------ |
| `eq`          | `= {value}`                    |
| `neq`         | `!= {value}`                   |
| `gt`          | `> {value}`                    |
| `gte`         | `>= {value}`                   |
| `lt`          | `< {value}`                    |
| `lte`         | `<= {value}`                   |
| `contains`    | `LIKE '%{value}%'`             |
| `starts_with` | `LIKE '{value}%'`              |
| `in`          | `IN ({value1}, {value2}, ...)` |

### Aggregation → SQL

| Aggregation       | SQL                                           |
| ----------------- | --------------------------------------------- |
| `count`           | `count()`                                     |
| `unique_players`  | `uniq(player_id)`                             |
| `unique_sessions` | `uniq(session_id)`                            |
| `avg`             | `avg(JSONExtractFloat64(properties, 'prop'))` |
| `sum`             | `sum(JSONExtractFloat64(properties, 'prop'))` |
| `min`             | `min(JSONExtractFloat64(properties, 'prop'))` |
| `max`             | `max(JSONExtractFloat64(properties, 'prop'))` |

### Granularity → Time Bucketing

| Granularity | SQL                                        |
| ----------- | ------------------------------------------ |
| `hour`      | `toStartOfHour(timestamp) AS time_bucket`  |
| `day`       | `toStartOfDay(timestamp) AS time_bucket`   |
| `week`      | `toStartOfWeek(timestamp) AS time_bucket`  |
| `month`     | `toStartOfMonth(timestamp) AS time_bucket` |
| `none`      | No time column in SELECT                   |

### Complete Generated SQL Example

Input: Count deaths by weapon on de_dust2, daily

```sql
SELECT
  toStartOfDay(timestamp) AS time_bucket,
  JSONExtractString(properties, 'weapon') AS weapon,
  count() AS value
FROM analytics.events
WHERE project_id = {projectId:String}
  AND event_type = {eventType:String}
  AND JSONExtractString(properties, 'map') = {filter_0_value:String}
  AND timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}
GROUP BY time_bucket, weapon
ORDER BY time_bucket, weapon
LIMIT 100
```

All values parameterized with `{name:Type}` — no string concatenation, injection-safe.

### AVG/SUM/MIN/MAX Property

For numeric aggregations (`avg`, `sum`, `min`, `max`), the user must specify which property to aggregate. This is handled via a special convention: if `aggregation` is one of these, the query builder looks for a filter with `property` matching the aggregation target, or accepts an optional `aggregateProperty` field in the request.

**Decision:** Add `aggregateProperty` field (optional, required only for `avg`/`sum`/`min`/`max`).

## Error Handling

| Status | Trigger                                                    |
| ------ | ---------------------------------------------------------- |
| `400`  | Invalid query config (Zod validation failure)              |
| `403`  | Project not accessible (existing `assertProjectOwnership`) |
| `422`  | Query too complex (>10 filters, >5 groupBy fields)         |
| `500`  | ClickHouse query execution failure                         |

## Limits

- Max 10 filters per query
- Max 5 groupBy fields
- Max 1000 result rows
- Time range max 90 days (prevents full table scans)
- `LIKE` filters disabled for string values > 256 chars (performance protection)
- `in` operator max 100 values

## Performance

- Uses existing `analytics.events` table with `(project_id, event_type, timestamp)` ordering
- ClickHouse uses primary key for project + time range filtering
- No new indexes needed
- JSONExtract functions work on raw strings — acceptable for analytics queries

## Testing

### Unit Tests (query-builder.ts)

- Each operator generates correct SQL
- Aggregation functions map correctly
- Parameter names are unique and valid
- Edge cases: empty filters, no groupBy, `none` granularity
- Time range validation (max 90 days)

### Integration Tests

- End-to-end with ClickHouse container via `bun run db:start`
- Seed known event data, verify query results
- Test auth/ownership rejection

## Security

- All user input parameterized via `{name:Type}` placeholders
- No string concatenation in SQL generation
- Project ownership check before query execution
- Rate limiting via existing oRPC middleware (if configured)

## Out of Scope

- Raw SQL query endpoint (security risk)
- Pre-built metric endpoints (can be added later as wrappers)
- Query result caching (ClickHouse is fast enough for 90-day ranges)
- Query saving/sharing (future feature)
- Sub-queries or JOINs (events table only)
- Custom time zones (UTC only)

## Future Enhancements

- Pre-built metric templates ("Visitors", "Retention Rate", "Player movements")
- Query result caching layer
- Saved queries / dashboards
- Real-time query mode (using `events_queue` instead of `events`)
- Query performance profiling

## References

- [Unity Analytics Custom Events](https://docs.unity.com/ugs/en-us/manual/analytics/manual/CustomEvents)
- [Google Analytics 4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [devtodev Custom Events](https://docs.devtodev.com/basic-events-and-custom-events.md)
- [Umami Event Tracking](https://umami.is/docs/track-events)
