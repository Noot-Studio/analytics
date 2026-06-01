# Spatial Events — Design Spec

**Date:** 2026-06-01
**Status:** Approved (design); pending implementation plan
**Topic:** Spatial events for volumetric heatmaps (player deaths, movement density, FPS drops) renderable both in-engine and in the dashboard.

---

## 1. Summary

Add **spatial events** to s&box Analytics: events that carry a 3D world `position` and a `scene` (map) identifier. Aggregated server-side into a 3D voxel grid, the data powers a **volumetric heatmap** showing where players die most, move most, where FPS drops, etc.

The same query payload is consumed by two renderers:

- the **C# SDK / game engine**, which draws the heatmap inside the s&box scene (primary use case), and
- the **React dashboard**, which renders a Three.js (R3F) 3D preview.

### Decisions locked during brainstorming

1. **First-class position** — `position` is promoted to a contract field with dedicated, nullable ClickHouse columns (not buried in `properties`). Spatial data is **opt-in per event**: events without `position` are unaffected.
2. **Voxel output = count + optional aggregated value** — each voxel returns event `count` and, when a `metric` is requested, an aggregate (`avg`/`min`/`max`/`sum`) of a numeric value pulled from `properties` (e.g. avg `fps`).
3. **Both consumers, full scope** — query route for the engine **and** a dashboard 3D viz, sharing one contract.
4. **Route structure = A** — spatial **procedures inside the existing analytics oRPC router** (`spatial.*`), reusing the current project-scoping/auth/registration pattern. No separate router module. Upgrade path to a dedicated module (`spatial-query.ts` / separate router) stays open if spatial grows.
5. **Scene-scoped coordinates** — every spatial event carries an optional `scene` string; voxel queries always filter by `scene`. Coordinates from different maps must never mix in one heatmap.

### Non-goals (YAGNI)

- No new ingestion endpoint — spatial events ride the existing `POST /v1/events` batch.
- No per-event spatial validation beyond numeric `x/y/z`.
- No real-time/streaming heatmap updates; queries are on-demand.
- No client-side raw-point fetching — binning is always server-side.
- No migration of historical non-spatial events (they simply have null positions).

---

## 2. Ingestion contract + storage

### 2.1 Event contract — `apps/ingest/src/schema.ts`

Add an optional `position` object and `scene` string to `eventSchema`:

```ts
const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const eventSchema = z.object({
  type: z.string().min(1).max(128),
  session_id: z.string().min(1).max(128),
  player_id: z.string().max(128).optional().default(""),
  properties: z.record(z.string(), z.unknown()).optional(),
  position: positionSchema.optional(), // ← new; presence marks a spatial event
  scene: z.string().max(128).optional().default(""), // ← map/scene the coords belong to
  timestamp: z.coerce.date().optional(),
});
```

- A **spatial event** is defined as any event with `position` present.
- `scene` defaults to `""` when omitted. Spatial events SHOULD set `scene`; the voxel query requires an explicit scene, so spatial events without one are queryable only under the empty-scene bucket (documented caveat).
- `properties` byte cap (`MAX_PROPERTIES_BYTES`) and batch caps (`MAX_BATCH_SIZE`, `MAX_BODY_BYTES`) unchanged.

### 2.2 ClickHouse schema — `packages/db/clickhouse/init.sql`

Add four additive columns to **both** `analytics.events` (MergeTree) and `analytics.events_queue` (Kafka engine), and extend the `analytics.events_mv` SELECT:

```sql
-- new columns (events + events_queue)
scene  LowCardinality(String) DEFAULT '',
pos_x  Nullable(Float32),
pos_y  Nullable(Float32),
pos_z  Nullable(Float32),
```

```sql
-- analytics.events_mv SELECT gains the new columns
SELECT
    project_id,
    event_type,
    timestamp,
    session_id,
    player_id,
    properties,
    scene,
    pos_x,
    pos_y,
    pos_z
FROM analytics.events_queue
WHERE length(_error) = 0;
```

Rationale:

- `scene` is `LowCardinality(String)` — few distinct maps per project.
- `pos_*` are `Nullable(Float32)` — `NULL` means a non-spatial event. The spatial route filters `pos_x IS NOT NULL`. `Float32` is ample for world coordinates and halves storage vs `Float64`.
- Existing `ORDER BY` key and 13-month TTL are **unchanged**. New columns are additive, so existing rows and queries keep working; old rows get `scene = ''` and null positions.

### 2.3 Ingest writer — `apps/ingest`

- Extend the `ClickHouseEvent` row interface with `scene: string` and `pos_x/pos_y/pos_z: number | null`.
- Map `position.{x,y,z}` → `pos_x/pos_y/pos_z`, `scene` → `scene`. When `position` is absent, write `null` for all three coordinates; when `scene` is absent, write `""`.

### 2.4 Migration — `packages/db/clickhouse/migrations/00X_spatial_columns.sql`

For existing deployments (the `init.sql` change only affects fresh installs):

```sql
ALTER TABLE analytics.events
  ADD COLUMN IF NOT EXISTS scene LowCardinality(String) DEFAULT '',
  ADD COLUMN IF NOT EXISTS pos_x Nullable(Float32),
  ADD COLUMN IF NOT EXISTS pos_y Nullable(Float32),
  ADD COLUMN IF NOT EXISTS pos_z Nullable(Float32);

ALTER TABLE analytics.events_queue
  ADD COLUMN IF NOT EXISTS scene LowCardinality(String) DEFAULT '',
  ADD COLUMN IF NOT EXISTS pos_x Nullable(Float32),
  ADD COLUMN IF NOT EXISTS pos_y Nullable(Float32),
  ADD COLUMN IF NOT EXISTS pos_z Nullable(Float32);
```

The `events_mv` materialized view must be recreated (`DROP` + `CREATE`) to include the new columns, since a MV's SELECT is fixed at creation. The migration file documents this step explicitly. Use the migration's exact next sequence number when authoring (`00X` is a placeholder).

---

## 3. Query route — `spatial.*`

Two procedures added to the existing analytics oRPC router, behind the same project-scoping/auth middleware as current analytics routes. All user inputs are passed as **bound ClickHouse query parameters** — never string-interpolated into SQL.

### 3.1 `spatial.scenes`

Lists scenes that contain spatial data, with coordinate bounds so a renderer can frame the heatmap and a UI can populate a scene picker.

```ts
// input
{ projectId: string, from?: Date, to?: Date }

// output
{
  scenes: Array<{
    scene: string,
    eventCount: number,
    bounds: { minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number },
  }>,
}
```

```sql
SELECT
  scene,
  count() AS eventCount,
  min(pos_x) AS minX, max(pos_x) AS maxX,
  min(pos_y) AS minY, max(pos_y) AS maxY,
  min(pos_z) AS minZ, max(pos_z) AS maxZ
FROM analytics.events
WHERE project_id = {projectId:String}
  AND pos_x IS NOT NULL
  AND timestamp BETWEEN {from:DateTime64} AND {to:DateTime64}
GROUP BY scene
ORDER BY eventCount DESC;
```

### 3.2 `spatial.voxels`

The volumetric heatmap payload.

```ts
// input
{
  projectId: string,
  scene: string,
  eventType?: string,        // e.g. "player_death"; omit = all spatial events in scene
  voxelSize: number,         // world units per cube edge; must be > 0
  from?: Date,
  to?: Date,
  metric?: {                 // omit → density-only (value = null)
    key: string,             // properties key, e.g. "fps"
    agg: "avg" | "min" | "max" | "sum",
  },
  bounds?: { minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number }, // optional clip
  limit?: number,            // default 50000; hard server cap to protect engine + payload size
}

// output
{
  voxelSize: number,
  voxels: Array<{
    x: number, y: number, z: number, // cell-CENTER world coordinates
    count: number,
    value: number | null,            // aggregated metric; null when no metric requested
  }>,
  truncated: boolean,                // true when the limit cap was hit
}
```

Binning SQL (ClickHouse does the aggregation; raw points never leave the DB):

```sql
SELECT
  floor(pos_x / {voxelSize:Float64}) AS gx,
  floor(pos_y / {voxelSize:Float64}) AS gy,
  floor(pos_z / {voxelSize:Float64}) AS gz,
  count() AS count,
  {agg}(JSONExtractFloat(properties, {metricKey:String})) AS value -- only when metric set
FROM analytics.events
WHERE project_id = {projectId:String}
  AND scene = {scene:String}
  AND pos_x IS NOT NULL
  AND timestamp BETWEEN {from:DateTime64} AND {to:DateTime64}
  AND event_type = {eventType:String}        -- clause included only when eventType set
  AND pos_x BETWEEN {minX:Float64} AND {maxX:Float64} -- bounds clauses only when bounds set
  AND pos_y BETWEEN {minY:Float64} AND {maxY:Float64}
  AND pos_z BETWEEN {minZ:Float64} AND {maxZ:Float64}
GROUP BY gx, gy, gz
ORDER BY count DESC
LIMIT {limitPlusOne:UInt32}; -- request limit+1 rows to detect truncation
```

- Output cell center: `x = (gx + 0.5) * voxelSize` (same for y, z).
- `ORDER BY count DESC` ensures that when the result is truncated, the **hottest** voxels survive — the most useful cells for a heatmap.
- `truncated = (rowsReturned > limit)`; the extra row is dropped before returning.
- `{agg}` is selected from a fixed allow-list (`avg`/`min`/`max`/`sum`) — never interpolated from raw user text.

### 3.3 Guardrails

- `voxelSize` must be `> 0` (zod refinement); reject otherwise.
- `limit` clamped to a hard maximum (default and cap = 50000).
- All scalar inputs bound as typed ClickHouse params.
- `metric.key` passed as a bound param to `JSONExtractFloat`.

### 3.4 Code organisation

SQL helpers live in the analytics router file initially. If spatial query logic grows, lift it into `packages/api/src/spatial-query.ts` (and optionally a dedicated router) — the approach-A→B upgrade path. No premature split.

---

## 4. Dashboard 3D visualization

### 4.1 Stack

- `@react-three/fiber` (R3F) + `@react-three/drei`. New dependencies, **lazy-loaded** so the 3D bundle never loads on non-spatial routes.

### 4.2 Route

- `apps/web/src/routes/dashboard/projects/$projectId/spatial.tsx`, nested in the existing project route tree, reusing the project loader/layout.
- Route loader calls `spatial.scenes` to populate the scene picker.

### 4.3 Component tree

```
SpatialView (route)
├─ Controls (top bar)
│   ├─ SceneSelect      ← from spatial.scenes
│   ├─ EventTypeSelect  ← distinct event types for the scene
│   ├─ VoxelSizeSlider  ← world units per cell (min bound prevents million-cell requests)
│   ├─ MetricSelect     ← none | properties-key + avg/min/max/sum
│   └─ TimeRangePicker  ← reuse existing dashboard control
├─ VoxelCanvas (R3F <Canvas frameloop="demand">, lazy)
│   ├─ <OrbitControls>   (drei) — orbit / zoom / pan
│   ├─ <VoxelField>      single InstancedMesh, one cube per voxel
│   ├─ <SceneBounds>     wireframe box from scene bounds
│   └─ axes + grid helpers
├─ ColorLegend           intensity → color scale
└─ EmptyState            scene has no spatial data
```

### 4.4 Rendering

- Data via existing oRPC client + TanStack Query (`spatial.voxels`); re-runs on control change, debounced.
- One `THREE.InstancedMesh` of unit cubes: per-voxel position = cell center, uniform scale = `voxelSize`, per-instance color = intensity. Instancing renders the 50k-cell cap in a single draw call.
- Intensity source: `count` (density mode) or `value` (metric mode), normalized min→max across the returned voxels, mapped through a color ramp (blue→red). Opacity optionally scales with intensity so dense regions read as solid.
- `truncated` from the payload → banner: "showing hottest 50k cells — increase voxel size for full coverage".

### 4.5 Engine parity

The dashboard consumes the **same** `spatial.voxels` payload the C# SDK / engine fetches — one contract, two renderers. A doc page in `apps/fumadocs` documents the route and payload so engine developers can render the heatmap in-scene from identical data.

### 4.6 Perf / UX

- `<Canvas frameloop="demand">` re-renders only on interaction (no idle render loop).
- Suspense fallback while the voxel query is in flight.
- `VoxelSizeSlider` has a sane minimum to prevent client-side requests that would blow past the server cap.

---

## 5. Documentation + env

- `apps/fumadocs/content/docs/api/` — new `spatial.mdx` documenting the `position`/`scene` event fields and the `spatial.scenes` / `spatial.voxels` payloads; cross-link from `events.mdx`.
- No new environment variables anticipated. If any are introduced during implementation, update root `.env.example` and the `packages/env` zod schema in the same change (per project rule).

---

## 6. Files touched (summary)

| Area            | File(s)                                                                      | Change                                                       |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Ingest contract | `apps/ingest/src/schema.ts`                                                  | add `position`, `scene`; extend `ClickHouseEvent`            |
| Ingest writer   | `apps/ingest/src/*` (writer)                                                 | map fields → row columns                                     |
| ClickHouse      | `packages/db/clickhouse/init.sql`                                            | add columns to `events` + `events_queue`; extend `events_mv` |
| ClickHouse      | `packages/db/clickhouse/migrations/00X_spatial_columns.sql`                  | `ALTER TABLE` + recreate MV                                  |
| Query API       | `packages/api/src/routers/analytics.ts` (+ optional `spatial-query.ts`)      | `spatial.scenes`, `spatial.voxels`                           |
| Dashboard       | `apps/web/src/routes/dashboard/projects/$projectId/spatial.tsx` + components | R3F voxel viz                                                |
| Web deps        | `apps/web/package.json`                                                      | `@react-three/fiber`, `@react-three/drei`                    |
| Docs            | `apps/fumadocs/content/docs/api/spatial.mdx`                                 | document fields + routes                                     |

---

## 7. Testing strategy

- **Voxel SQL / query builder** — unit tests (Bun) for binning math (cell-center derivation), clause inclusion (eventType/metric/bounds optional), `truncated` detection, and `agg` allow-listing. Highest-value target per project test guidance.
- **Ingest contract** — schema tests: spatial event accepted, non-spatial event still accepted, malformed `position` rejected.
- **Dashboard** — light component test for empty-state and truncation banner; 3D canvas itself not unit-tested.
