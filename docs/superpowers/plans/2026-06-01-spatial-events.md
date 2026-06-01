# Spatial Events (Volumetric Heatmaps) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let s&box developers emit events carrying a 3D `position`+`scene`, then query them as a server-binned voxel grid powering a volumetric heatmap rendered both in-engine (C# SDK) and in the dashboard (React + R3F).

**Architecture:** `position`/`scene` become first-class, opt-in fields on the existing `POST /v1/events` batch (no new endpoint). They flow through Redpanda → ClickHouse via new nullable columns. Two new oRPC procedures (`spatial.scenes`, `spatial.voxels`) live inside the existing analytics router (mounted under the `insights` namespace), backed by a pure, unit-tested SQL builder (`spatial-query.ts`). The dashboard adds a lazy-loaded Three.js voxel viewer consuming the same `spatial.voxels` payload the engine fetches.

**Tech Stack:** Bun, Hono (ingest), Zod 4, Redpanda/Kafka, ClickHouse (MergeTree + Kafka engine + MV), oRPC, Prisma/Postgres (auth/project access), React + TanStack Router + `@react-three/fiber`/`@react-three/drei`/`three`. Tests: `bun test`.

---

## File Structure

| File                                                                    | Responsibility                               | Change                                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/ingest/src/schema.ts`                                             | Event validation + CH row type + row builder | Add `position`/`scene` to `eventSchema`, extend `ClickHouseEvent`, add pure `toClickHouseEvent()` |
| `apps/ingest/src/schema.test.ts`                                        | Schema + row-builder tests                   | Create                                                                                            |
| `apps/ingest/src/index.ts`                                              | Ingest HTTP handler                          | Replace inline row literal with `toClickHouseEvent()`                                             |
| `packages/db/clickhouse/init.sql`                                       | Fresh-install DDL                            | Add columns to `events` + `events_queue`; extend `events_mv` SELECT                               |
| `packages/db/clickhouse/migrations/002_spatial_columns.sql`             | Migration for existing deployments           | Create                                                                                            |
| `packages/api/src/spatial-query.ts`                                     | Pure SQL builders + voxel math               | Create                                                                                            |
| `packages/api/src/spatial-query.test.ts`                                | Builder unit tests                           | Create                                                                                            |
| `packages/api/src/routers/analytics.ts`                                 | oRPC procedures                              | Add `spatial` nested procedures                                                                   |
| `apps/web/package.json`                                                 | Web deps                                     | Add three/R3F/drei                                                                                |
| `apps/web/src/features/analytics/components/organisms/spatial-view.tsx` | Spatial page UI + controls                   | Create                                                                                            |
| `apps/web/src/features/analytics/components/organisms/voxel-canvas.tsx` | Lazy R3F 3D renderer                         | Create                                                                                            |
| `apps/web/src/routes/dashboard/projects/$projectId/spatial.tsx`         | Route                                        | Create                                                                                            |
| `apps/fumadocs/content/docs/api/spatial.mdx`                            | Public docs                                  | Create                                                                                            |

> **Note on exact patterns observed in the codebase** (do not deviate):
>
> - `protectedProcedure` is imported from `../index` in `analytics.ts`.
> - Project access check: `await assertProjectAccess(input.projectId, ctx.session.user.id);` (first line of every handler).
> - ClickHouse call: `const result = await clickhouse().query({ format: "JSON", query, query_params });` where `clickhouse` is imported from `../clickhouse`. Then `const json = await result.json<z.infer<typeof RowSchema>>();` and `z.array(RowSchema).parse(json.data)`.
> - CH named-param placeholders use `{name:Type}` syntax (e.g. `{projectId:String}`, `{from:Date}`), NOT `::` casts. Date filtering mirrors maps: `toDate(timestamp) BETWEEN {from:Date} AND {to:Date}`.
> - `query_params` accepts only flat scalars — nested objects (metric/bounds) must be flattened by the builder.
> - CH `JSON` format returns `count()`/UInt64 as strings → parse with `z.coerce.number()`.
> - Zod 4 idioms in use: `z.iso.date()`, `z.string().min(1)`.
> - The `analyticsRouter` export is a plain object of procedures; it is mounted under the `insights` namespace, so the frontend calls `orpc.insights.spatial.voxels...`.

---

## Task 1: Ingest contract — `position` + `scene` fields and row builder

**Files:**

- Modify: `apps/ingest/src/schema.ts`
- Test: `apps/ingest/src/schema.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/ingest/src/schema.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { batchSchema, toClickHouseEvent } from "./schema";

describe("eventSchema spatial fields", () => {
  it("accepts an event with position + scene", () => {
    const parsed = batchSchema.parse({
      events: [
        {
          type: "player_death",
          session_id: "sess_1",
          position: { x: 1.5, y: -2, z: 30 },
          scene: "dm_arena",
        },
      ],
    });
    expect(parsed.events[0].position).toEqual({ x: 1.5, y: -2, z: 30 });
    expect(parsed.events[0].scene).toBe("dm_arena");
  });

  it("accepts a non-spatial event (no position, scene defaults to '')", () => {
    const parsed = batchSchema.parse({
      events: [{ type: "level_up", session_id: "sess_1" }],
    });
    expect(parsed.events[0].position).toBeUndefined();
    expect(parsed.events[0].scene).toBe("");
  });

  it("rejects a malformed position (non-numeric coord)", () => {
    expect(() =>
      batchSchema.parse({
        events: [
          {
            type: "x",
            session_id: "s",
            position: { x: "nope", y: 0, z: 0 },
          },
        ],
      })
    ).toThrow();
  });
});

describe("toClickHouseEvent", () => {
  it("maps a spatial event to null-free pos columns", () => {
    const row = toClickHouseEvent(
      {
        type: "player_death",
        session_id: "sess_1",
        player_id: "",
        scene: "dm_arena",
        position: { x: 1, y: 2, z: 3 },
      },
      "proj_1"
    );
    expect(row).toMatchObject({
      project_id: "proj_1",
      event_type: "player_death",
      scene: "dm_arena",
      pos_x: 1,
      pos_y: 2,
      pos_z: 3,
    });
  });

  it("maps a non-spatial event to null positions and empty scene", () => {
    const row = toClickHouseEvent(
      { type: "level_up", session_id: "s", player_id: "", scene: "" },
      "proj_1"
    );
    expect(row.pos_x).toBeNull();
    expect(row.pos_y).toBeNull();
    expect(row.pos_z).toBeNull();
    expect(row.scene).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/ingest && bun test src/schema.test.ts`
Expected: FAIL — `toClickHouseEvent` is not exported; `position`/`scene` not on parsed type.

- [ ] **Step 3: Edit `apps/ingest/src/schema.ts`**

Add the position schema and extend `eventSchema` (the existing object — keep all current fields `type`, `session_id`, `player_id`, `properties`, `timestamp`):

```ts
const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});
```

Inside the existing `eventSchema = z.object({ ... })`, add these two entries:

```ts
  position: positionSchema.optional(),
  scene: z.string().max(128).optional().default(""),
```

Extend the existing `ClickHouseEvent` type with the four new columns:

```ts
export type ClickHouseEvent = {
  project_id: string;
  event_type: string;
  player_id: string;
  properties: string;
  session_id: string;
  timestamp: string;
  scene: string;
  pos_x: number | null;
  pos_y: number | null;
  pos_z: number | null;
};
```

Add the pure row builder (used by `index.ts` in Task 2). `properties` stringification stays in `index.ts` because of the byte-size guard, so accept it as an argument:

```ts
export function toClickHouseEvent(
  event: IncomingEvent,
  projectId: string,
  properties = "{}"
): ClickHouseEvent {
  return {
    event_type: event.type,
    player_id: event.player_id,
    project_id: projectId,
    properties,
    session_id: event.session_id,
    timestamp: formatTimestamp(event.timestamp ?? new Date()),
    scene: event.scene,
    pos_x: event.position?.x ?? null,
    pos_y: event.position?.y ?? null,
    pos_z: event.position?.z ?? null,
  };
}
```

> The test calls `toClickHouseEvent(event, projectId)` without `properties`; the default `"{}"` covers it. The spatial assertions don't inspect `properties`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/ingest && bun test src/schema.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/ingest/src/schema.ts apps/ingest/src/schema.test.ts
git commit -m "feat(ingest): add spatial position/scene fields + row builder"
```

---

## Task 2: Ingest handler uses the row builder

**Files:**

- Modify: `apps/ingest/src/index.ts` (the `records.push({...})` loop, lines ~62-76)

- [ ] **Step 1: Edit `apps/ingest/src/index.ts`**

Import the builder (add `toClickHouseEvent` to the existing `./schema` import):

```ts
import {
  batchSchema,
  formatTimestamp,
  MAX_PROPERTIES_BYTES,
  toClickHouseEvent,
  type ClickHouseEvent,
} from "./schema";
```

> Keep whatever names the file already imports from `./schema`; just add `toClickHouseEvent`. `formatTimestamp` may no longer be referenced directly here — if Oxlint flags it as unused, remove it from this import only.

Replace the loop body (current lines 62-76) with:

```ts
const records: ClickHouseEvent[] = [];
for (const ev of parsed.data.events) {
  const properties = ev.properties ? JSON.stringify(ev.properties) : "{}";
  if (properties.length > MAX_PROPERTIES_BYTES) {
    throw new HTTPException(400, { message: "properties too large" });
  }
  records.push(toClickHouseEvent(ev, projectId, properties));
}
```

> Preserve the exact `HTTPException` message string already used in the file (the verbatim source showed `"properties too large"`). Do not change the producer/publish code that follows the loop — `records` keeps the same shape plus the four new keys, which serialize into the Redpanda JSON automatically.

- [ ] **Step 2: Type-check + run existing ingest tests**

Run: `cd apps/ingest && bun test`
Expected: PASS (no regressions; Task 1 tests still green).

- [ ] **Step 3: Commit**

```bash
git add apps/ingest/src/index.ts
git commit -m "refactor(ingest): build CH rows via toClickHouseEvent"
```

---

## Task 3: ClickHouse fresh-install DDL

**Files:**

- Modify: `packages/db/clickhouse/init.sql`

> The columns must be added in THREE places and stay consistent: `analytics.events` (MergeTree sink), `analytics.events_queue` (Kafka engine source), and `analytics.events_mv` (the MV SELECT that copies queue→events). `events_queue` has NO `ingested_at` column; do not add one. The MV's SELECT is fixed at creation, so it must list the new columns explicitly.

- [ ] **Step 1: Add columns to `analytics.events`**

In the `CREATE TABLE IF NOT EXISTS analytics.events (...)` block, after the existing `properties String,` line (and before `ingested_at`), add:

```sql
    scene LowCardinality(String) DEFAULT '',
    pos_x Nullable(Float32),
    pos_y Nullable(Float32),
    pos_z Nullable(Float32),
```

Leave `ENGINE = MergeTree`, `PARTITION BY toYYYYMM(timestamp)`, `ORDER BY (project_id, event_type, timestamp, session_id)`, and the 13-month `TTL` unchanged — the new columns are additive.

- [ ] **Step 2: Add columns to `analytics.events_queue`**

In the `CREATE TABLE IF NOT EXISTS analytics.events_queue (...)` Kafka-engine block, after its `properties String,` line, add the same four lines:

```sql
    scene LowCardinality(String) DEFAULT '',
    pos_x Nullable(Float32),
    pos_y Nullable(Float32),
    pos_z Nullable(Float32),
```

Leave the `ENGINE = Kafka` settings (`kafka_broker_list`, `kafka_topic_list`, `kafka_format = 'JSONEachRow'`, etc.) unchanged. JSONEachRow fills missing fields with column defaults, so old non-spatial producers still parse (pos → NULL, scene → '').

- [ ] **Step 3: Extend the `analytics.events_mv` SELECT**

In `CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.events_mv ... AS SELECT ... FROM analytics.events_queue WHERE length(_error) = 0`, add the three position columns and `scene` to the SELECT list so the column set matches `analytics.events`:

```sql
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

- [ ] **Step 4: Validate SQL syntax locally (fresh container)**

Run (only if a local CH is available; otherwise rely on Task 4's migration applying cleanly):
`docker compose up -d clickhouse && cat packages/db/clickhouse/init.sql | docker compose exec -T clickhouse clickhouse-client --multiquery`
Expected: no errors. (If the project has a db-init script/task, run that instead — check `package.json` scripts.)

- [ ] **Step 5: Commit**

```bash
git add packages/db/clickhouse/init.sql
git commit -m "feat(db): add scene + pos_x/y/z columns to events schema"
```

---

## Task 4: Migration for existing deployments

**Files:**

- Create: `packages/db/clickhouse/migrations/002_spatial_columns.sql`

> The existing migrations dir contains `001_phase1_views.sql`, so the next sequence number is `002`.

- [ ] **Step 1: Create the migration file**

```sql
-- 002_spatial_columns.sql
-- Adds first-class spatial columns (scene + 3D position) to the events pipeline.
-- Spatial data is opt-in per event: non-spatial rows get scene='' and NULL positions.

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

-- A materialized view's SELECT is fixed at creation, so recreate it to emit the new columns.
-- Dropping the MV does NOT touch already-ingested rows in analytics.events.
DROP VIEW IF EXISTS analytics.events_mv;

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.events_mv
TO analytics.events
AS
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

> Verify the `TO analytics.events` clause and the `WHERE length(_error) = 0` predicate match the verbatim `events_mv` definition in `init.sql` after Task 3. If `init.sql` uses a different MV body (e.g. additional columns or a different error guard), copy that body exactly here so the two never drift.

- [ ] **Step 2: Apply migration against a running CH (if available)**

Run: `cat packages/db/clickhouse/migrations/002_spatial_columns.sql | docker compose exec -T clickhouse clickhouse-client --multiquery`
Then verify: `docker compose exec -T clickhouse clickhouse-client -q "DESCRIBE analytics.events" | grep pos_`
Expected: `pos_x`, `pos_y`, `pos_z` listed as `Nullable(Float32)`, plus `scene`.

- [ ] **Step 3: Commit**

```bash
git add packages/db/clickhouse/migrations/002_spatial_columns.sql
git commit -m "feat(db): migration adding spatial columns + MV recreate"
```

---

## Task 5: Pure SQL builder + voxel math (`spatial-query.ts`)

**Files:**

- Create: `packages/api/src/spatial-query.ts`
- Test: `packages/api/src/spatial-query.test.ts`

> This is the highest-value unit-test target: it isolates all 3D-binning SQL generation and the cell-center math from the network/DB. The router (Task 6) just calls these. Keeping `query_params` building here also solves the "scalars only" constraint — the builder flattens nested `metric`/`bounds` into flat params.

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/spatial-query.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  buildScenesQuery,
  buildVoxelsQuery,
  voxelCenter,
  type VoxelsInput,
} from "./spatial-query";

const base: VoxelsInput = {
  projectId: "proj_1",
  scene: "dm_arena",
  voxelSize: 32,
  from: "2026-05-01",
  to: "2026-06-01",
  limit: 50000,
};

describe("voxelCenter", () => {
  it("returns the center of a grid cell", () => {
    expect(voxelCenter(0, 32)).toBe(16);
    expect(voxelCenter(-1, 32)).toBe(-16);
    expect(voxelCenter(3, 10)).toBe(35);
  });
});

describe("buildVoxelsQuery", () => {
  it("density-only: no metric → value is NULL, no metricKey param", () => {
    const { query, params } = buildVoxelsQuery(base);
    expect(query).toContain("NULL AS value");
    expect(query).toContain("floor(pos_x / {voxelSize:Float64}) AS gx");
    expect(query).toContain("scene = {scene:String}");
    expect(query).toContain("pos_x IS NOT NULL");
    expect(query).toContain(
      "toDate(timestamp) BETWEEN {from:Date} AND {to:Date}"
    );
    expect(query).toContain("ORDER BY count DESC");
    expect(query).toContain("LIMIT {limitPlusOne:UInt32}");
    expect(query).not.toContain("event_type = {eventType:String}");
    expect(params).toMatchObject({
      projectId: "proj_1",
      scene: "dm_arena",
      voxelSize: 32,
      from: "2026-05-01",
      to: "2026-06-01",
      limitPlusOne: 50001,
    });
    expect(params.metricKey).toBeUndefined();
    expect(params.eventType).toBeUndefined();
  });

  it("includes the event_type clause + param when eventType set", () => {
    const { query, params } = buildVoxelsQuery({
      ...base,
      eventType: "player_death",
    });
    expect(query).toContain("event_type = {eventType:String}");
    expect(params.eventType).toBe("player_death");
  });

  it("metric mode: emits agg(JSONExtractFloat(...)) and metricKey param", () => {
    const { query, params } = buildVoxelsQuery({
      ...base,
      metric: { key: "fps", agg: "avg" },
    });
    expect(query).toContain(
      "avg(JSONExtractFloat(properties, {metricKey:String})) AS value"
    );
    expect(params.metricKey).toBe("fps");
  });

  it("rejects an agg not in the allow-list", () => {
    expect(() =>
      buildVoxelsQuery({
        ...base,
        // @ts-expect-error testing runtime guard
        metric: { key: "fps", agg: "drop tables" },
      })
    ).toThrow();
  });

  it("bounds mode: adds three BETWEEN clauses + 6 numeric params", () => {
    const { query, params } = buildVoxelsQuery({
      ...base,
      bounds: {
        minX: -100,
        maxX: 100,
        minY: -50,
        maxY: 50,
        minZ: 0,
        maxZ: 200,
      },
    });
    expect(query).toContain("pos_x BETWEEN {minX:Float64} AND {maxX:Float64}");
    expect(query).toContain("pos_y BETWEEN {minY:Float64} AND {maxY:Float64}");
    expect(query).toContain("pos_z BETWEEN {minZ:Float64} AND {maxZ:Float64}");
    expect(params).toMatchObject({
      minX: -100,
      maxX: 100,
      minY: -50,
      maxY: 50,
      minZ: 0,
      maxZ: 200,
    });
  });
});

describe("buildScenesQuery", () => {
  it("aggregates bounds per scene, filtered to spatial rows", () => {
    const { query, params } = buildScenesQuery({
      projectId: "proj_1",
      from: "2026-05-01",
      to: "2026-06-01",
    });
    expect(query).toContain("pos_x IS NOT NULL");
    expect(query).toContain("min(pos_x) AS minX");
    expect(query).toContain("max(pos_z) AS maxZ");
    expect(query).toContain("GROUP BY scene");
    expect(query).toContain("ORDER BY eventCount DESC");
    expect(params).toEqual({
      projectId: "proj_1",
      from: "2026-05-01",
      to: "2026-06-01",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api && bun test src/spatial-query.test.ts`
Expected: FAIL — module `./spatial-query` not found.

- [ ] **Step 3: Create `packages/api/src/spatial-query.ts`**

```ts
// Pure ClickHouse query builders for spatial (voxel) analytics.
// No DB/network access — fully unit-testable. The router layer feeds the
// returned { query, params } straight into clickhouse().query({ query_params: params }).

const AGG_FUNCTIONS = {
  avg: "avg",
  min: "min",
  max: "max",
  sum: "sum",
} as const;

export type VoxelAgg = keyof typeof AGG_FUNCTIONS;

export type VoxelBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type VoxelsInput = {
  projectId: string;
  scene: string;
  eventType?: string;
  voxelSize: number;
  from: string;
  to: string;
  metric?: { key: string; agg: VoxelAgg };
  bounds?: VoxelBounds;
  limit: number;
};

export type ScenesInput = {
  projectId: string;
  from: string;
  to: string;
};

export type BuiltQuery = {
  query: string;
  params: Record<string, unknown>;
};

/** World-space center of voxel grid index `g` for a cube edge of `voxelSize`. */
export function voxelCenter(g: number, voxelSize: number): number {
  return (g + 0.5) * voxelSize;
}

export function buildVoxelsQuery(input: VoxelsInput): BuiltQuery {
  const params: Record<string, unknown> = {
    projectId: input.projectId,
    scene: input.scene,
    from: input.from,
    to: input.to,
    voxelSize: input.voxelSize,
    limitPlusOne: input.limit + 1,
  };

  const where = [
    "project_id = {projectId:String}",
    "scene = {scene:String}",
    "pos_x IS NOT NULL",
    "toDate(timestamp) BETWEEN {from:Date} AND {to:Date}",
  ];

  if (input.eventType) {
    where.push("event_type = {eventType:String}");
    params.eventType = input.eventType;
  }

  if (input.bounds) {
    where.push("pos_x BETWEEN {minX:Float64} AND {maxX:Float64}");
    where.push("pos_y BETWEEN {minY:Float64} AND {maxY:Float64}");
    where.push("pos_z BETWEEN {minZ:Float64} AND {maxZ:Float64}");
    Object.assign(params, input.bounds);
  }

  let valueExpr = "NULL";
  if (input.metric) {
    const fn = AGG_FUNCTIONS[input.metric.agg];
    if (!fn) {
      throw new Error(`Unsupported aggregation: ${input.metric.agg}`);
    }
    valueExpr = `${fn}(JSONExtractFloat(properties, {metricKey:String}))`;
    params.metricKey = input.metric.key;
  }

  const query = `
    SELECT
      floor(pos_x / {voxelSize:Float64}) AS gx,
      floor(pos_y / {voxelSize:Float64}) AS gy,
      floor(pos_z / {voxelSize:Float64}) AS gz,
      count() AS count,
      ${valueExpr} AS value
    FROM analytics.events
    WHERE ${where.join("\n      AND ")}
    GROUP BY gx, gy, gz
    ORDER BY count DESC
    LIMIT {limitPlusOne:UInt32}
  `;

  return { query, params };
}

export function buildScenesQuery(input: ScenesInput): BuiltQuery {
  const params: Record<string, unknown> = {
    projectId: input.projectId,
    from: input.from,
    to: input.to,
  };

  const query = `
    SELECT
      scene,
      count() AS eventCount,
      min(pos_x) AS minX,
      max(pos_x) AS maxX,
      min(pos_y) AS minY,
      max(pos_y) AS maxY,
      min(pos_z) AS minZ,
      max(pos_z) AS maxZ
    FROM analytics.events
    WHERE project_id = {projectId:String}
      AND pos_x IS NOT NULL
      AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
    GROUP BY scene
    ORDER BY eventCount DESC
  `;

  return { query, params };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api && bun test src/spatial-query.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/spatial-query.ts packages/api/src/spatial-query.test.ts
git commit -m "feat(api): pure voxel/scenes SQL builders with tests"
```

---

## Task 6: Wire `spatial` procedures into the analytics router

**Files:**

- Modify: `packages/api/src/routers/analytics.ts`

> Follow the EXACT pattern of the existing `maps` procedure: `protectedProcedure.input(schema).handler(async ({ ctx, input }) => { await assertProjectAccess(input.projectId, ctx.session.user.id); ... })`, the `clickhouse().query({ format: "JSON", query, query_params })` call, `await result.json<...>()`, and `z.array(RowSchema).parse(json.data)`. Add a nested `spatial` key to the `analyticsRouter` object so the frontend reaches it at `orpc.insights.spatial.scenes` / `orpc.insights.spatial.voxels`.

- [ ] **Step 1: Add imports near the top of `analytics.ts`**

Add to the existing imports (keep `protectedProcedure` from `../index`, `clickhouse` from `../clickhouse`, `z`):

```ts
import {
  buildScenesQuery,
  buildVoxelsQuery,
  voxelCenter,
} from "../spatial-query";
```

- [ ] **Step 2: Define the input/output schemas (place beside the other `*Input`/`*Output` schemas, ~line 80)**

```ts
const spatialScenesInput = z.object({
  projectId: z.string().min(1),
  from: z.iso.date(),
  to: z.iso.date(),
});

const spatialSceneRow = z.object({
  scene: z.string(),
  eventCount: z.coerce.number(),
  minX: z.coerce.number(),
  maxX: z.coerce.number(),
  minY: z.coerce.number(),
  maxY: z.coerce.number(),
  minZ: z.coerce.number(),
  maxZ: z.coerce.number(),
});

const spatialScenesOutput = z.object({
  scenes: z.array(
    z.object({
      scene: z.string(),
      eventCount: z.number(),
      bounds: z.object({
        minX: z.number(),
        maxX: z.number(),
        minY: z.number(),
        maxY: z.number(),
        minZ: z.number(),
        maxZ: z.number(),
      }),
    })
  ),
});

const voxelMetricInput = z.object({
  key: z.string().min(1),
  agg: z.enum(["avg", "min", "max", "sum"]),
});

const voxelBoundsInput = z.object({
  minX: z.number(),
  maxX: z.number(),
  minY: z.number(),
  maxY: z.number(),
  minZ: z.number(),
  maxZ: z.number(),
});

const MAX_VOXELS = 50_000;

const spatialVoxelsInput = z.object({
  projectId: z.string().min(1),
  scene: z.string().min(1),
  eventType: z.string().min(1).optional(),
  voxelSize: z.number().positive(),
  from: z.iso.date(),
  to: z.iso.date(),
  metric: voxelMetricInput.optional(),
  bounds: voxelBoundsInput.optional(),
  limit: z.number().int().positive().max(MAX_VOXELS).default(MAX_VOXELS),
});

const voxelRow = z.object({
  gx: z.coerce.number(),
  gy: z.coerce.number(),
  gz: z.coerce.number(),
  count: z.coerce.number(),
  value: z.coerce.number().nullable(),
});

const spatialVoxelsOutput = z.object({
  voxelSize: z.number(),
  voxels: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      count: z.number(),
      value: z.number().nullable(),
    })
  ),
  truncated: z.boolean(),
});
```

- [ ] **Step 3: Add the `spatial` procedures to the `analyticsRouter` object**

Inside the `analyticsRouter` object literal (alongside `overview`, `sessions`, `maps`, …), add:

```ts
  spatial: {
    scenes: protectedProcedure
      .input(spatialScenesInput)
      .handler(async ({ ctx, input }) => {
        await assertProjectAccess(input.projectId, ctx.session.user.id);

        const { query, params } = buildScenesQuery(input);
        const result = await clickhouse().query({
          format: "JSON",
          query,
          query_params: params,
        });
        const json = await result.json<z.infer<typeof spatialSceneRow>>();
        const rows = z.array(spatialSceneRow).parse(json.data);

        return spatialScenesOutput.parse({
          scenes: rows.map((r) => ({
            scene: r.scene,
            eventCount: r.eventCount,
            bounds: {
              minX: r.minX,
              maxX: r.maxX,
              minY: r.minY,
              maxY: r.maxY,
              minZ: r.minZ,
              maxZ: r.maxZ,
            },
          })),
        });
      }),

    voxels: protectedProcedure
      .input(spatialVoxelsInput)
      .handler(async ({ ctx, input }) => {
        await assertProjectAccess(input.projectId, ctx.session.user.id);

        const { query, params } = buildVoxelsQuery(input);
        const result = await clickhouse().query({
          format: "JSON",
          query,
          query_params: params,
        });
        const json = await result.json<z.infer<typeof voxelRow>>();
        const rows = z.array(voxelRow).parse(json.data);

        const truncated = rows.length > input.limit;
        const voxels = rows.slice(0, input.limit).map((r) => ({
          x: voxelCenter(r.gx, input.voxelSize),
          y: voxelCenter(r.gy, input.voxelSize),
          z: voxelCenter(r.gz, input.voxelSize),
          count: r.count,
          value: r.value,
        }));

        return spatialVoxelsOutput.parse({
          voxelSize: input.voxelSize,
          voxels,
          truncated,
        });
      }),
  },
```

> Use the SAME project-access helper name the file already uses. The verbatim source showed `assertProjectAccess(input.projectId, ctx.session.user.id)`. If the actual helper differs (e.g. `await ctx.assertProjectAccess(...)`), match the existing `maps` handler exactly — copy its first line.

- [ ] **Step 4: Type-check the package**

Run: `cd packages/api && bun run typecheck` (or `bunx tsc --noEmit` if no `typecheck` script).
Expected: no type errors. Re-run `bun test` to confirm the builder tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/analytics.ts
git commit -m "feat(api): add spatial.scenes + spatial.voxels procedures"
```

---

## Task 7: Add 3D rendering dependencies to the web app

**Files:**

- Modify: `apps/web/package.json`

- [ ] **Step 1: Install deps (Bun, from repo root or `apps/web`)**

Run: `cd apps/web && bun add three @react-three/fiber @react-three/drei && bun add -d @types/three`
Expected: `three`, `@react-three/fiber`, `@react-three/drei` in `dependencies`; `@types/three` in `devDependencies`.

> R3F v9 requires React 19, which this app already uses. If `bun add` resolves an incompatible React peer, pin `@react-three/fiber` to the latest v9.x.

- [ ] **Step 2: Verify install + commit**

Run: `cd apps/web && bun run build` (or the app's typecheck script) to confirm the deps resolve.
Expected: build/typecheck succeeds.

```bash
git add apps/web/package.json bun.lock
git commit -m "chore(web): add three + react-three-fiber for spatial viz"
```

---

## Task 8: Voxel canvas + spatial view components

**Files:**

- Create: `apps/web/src/features/analytics/components/organisms/voxel-canvas.tsx`
- Create: `apps/web/src/features/analytics/components/organisms/spatial-view.tsx`

> Match existing component conventions: arrow-function components, UI primitives imported from `@sbox-analytics/ui/components/*`, oRPC client from `@/utils/orpc`, the `isoDaysAgo` helper from the analytics lib (verify its exact path — the verbatim source showed it imported in sibling organisms; reuse that import). The canvas is its own file so it can be lazy-loaded, keeping `three` out of the main bundle.

- [ ] **Step 1: Create `voxel-canvas.tsx` (the R3F renderer)**

```tsx
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { Color, Matrix4, Vector3 } from "three";

export type Voxel = {
  x: number;
  y: number;
  z: number;
  count: number;
  value: number | null;
};

type VoxelCanvasProps = {
  voxels: Voxel[];
  voxelSize: number;
  // When true, color by `value` (metric mode); otherwise color by `count` (density).
  useMetric: boolean;
};

const LOW_COLOR = new Color("#1e3a8a"); // blue-900
const HIGH_COLOR = new Color("#ef4444"); // red-500

const intensityOf = (v: Voxel, useMetric: boolean): number =>
  useMetric ? (v.value ?? 0) : v.count;

const VoxelInstances = ({ voxels, voxelSize, useMetric }: VoxelCanvasProps) => {
  const { matrices, colors } = useMemo(() => {
    const intensities = voxels.map((v) => intensityOf(v, useMetric));
    const min = Math.min(...intensities, 0);
    const max = Math.max(...intensities, 1);
    const span = max - min || 1;

    const mats: Matrix4[] = [];
    const cols: Color[] = [];
    const scale = new Vector3(voxelSize, voxelSize, voxelSize);
    for (const v of voxels) {
      const m = new Matrix4();
      m.compose(new Vector3(v.x, v.z, v.y), undefined as never, scale);
      // Note: map engine Z (up) to Three.js Y (up) so the heatmap stands upright.
      mats.push(m);
      const t = (intensityOf(v, useMetric) - min) / span;
      cols.push(LOW_COLOR.clone().lerp(HIGH_COLOR, t));
    }
    return { matrices: mats, colors: cols };
  }, [voxels, voxelSize, useMetric]);

  return (
    <instancedMesh
      args={[undefined, undefined, voxels.length]}
      ref={(mesh) => {
        if (!mesh) {
          return;
        }
        for (let i = 0; i < matrices.length; i++) {
          mesh.setMatrixAt(i, matrices[i]);
          mesh.setColorAt(i, colors[i]);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial transparent opacity={0.85} />
    </instancedMesh>
  );
};

const VoxelCanvas = ({ voxels, voxelSize, useMetric }: VoxelCanvasProps) => (
  <Canvas
    camera={{ position: [400, 400, 400], far: 100_000 }}
    frameloop="demand"
  >
    <ambientLight intensity={0.8} />
    <directionalLight position={[100, 200, 100]} />
    <gridHelper args={[2000, 20]} />
    <axesHelper args={[200]} />
    <VoxelInstances
      voxels={voxels}
      voxelSize={voxelSize}
      useMetric={useMetric}
    />
    <OrbitControls makeDefault />
  </Canvas>
);

export default VoxelCanvas;
```

> `frameloop="demand"` only re-renders on interaction. `OrbitControls makeDefault` triggers a render on orbit/zoom. The `default export` is required for `React.lazy` in Step 2.

- [ ] **Step 2: Create `spatial-view.tsx` (controls + data + lazy canvas)**

```tsx
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import { Label } from "@sbox-analytics/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { Slider } from "@sbox-analytics/ui/components/slider";
import { orpc } from "@/utils/orpc";
import { isoDaysAgo } from "../../lib/date-window";

const VoxelCanvas = lazy(() => import("./voxel-canvas"));

type SpatialViewProps = { projectId: string };

const MIN_VOXEL_SIZE = 8;
const MAX_VOXEL_SIZE = 256;
const DEFAULT_VOXEL_SIZE = 32;
const WINDOW_DAYS = 30;

const SpatialView = ({ projectId }: SpatialViewProps) => {
  const from = useMemo(() => isoDaysAgo(WINDOW_DAYS), []);
  const to = useMemo(() => isoDaysAgo(0), []);

  const [scene, setScene] = useState<string>("");
  const [voxelSize, setVoxelSize] = useState<number>(DEFAULT_VOXEL_SIZE);

  const scenesQuery = useQuery(
    orpc.insights.spatial.scenes.queryOptions({
      input: { projectId, from, to },
    })
  );

  const scenes = scenesQuery.data?.scenes ?? [];
  const activeScene = scene || scenes[0]?.scene || "";

  const voxelsQuery = useQuery(
    orpc.insights.spatial.voxels.queryOptions({
      input: { projectId, scene: activeScene, voxelSize, from, to },
      enabled: activeScene.length > 0,
    })
  );

  const voxels = voxelsQuery.data?.voxels ?? [];
  const truncated = voxelsQuery.data?.truncated ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="scene-select">Scene</Label>
          <Select value={activeScene} onValueChange={setScene}>
            <SelectTrigger className="w-48" id="scene-select">
              <SelectValue placeholder="Select scene" />
            </SelectTrigger>
            <SelectContent>
              {scenes.map((s) => (
                <SelectItem key={s.scene} value={s.scene}>
                  {s.scene || "(unnamed)"} ({s.eventCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex w-48 flex-col gap-1">
          <Label htmlFor="voxel-size">Voxel size: {voxelSize}</Label>
          <Slider
            id="voxel-size"
            max={MAX_VOXEL_SIZE}
            min={MIN_VOXEL_SIZE}
            step={MIN_VOXEL_SIZE}
            value={[voxelSize]}
            onValueChange={(v) => setVoxelSize(v[0] ?? DEFAULT_VOXEL_SIZE)}
          />
        </div>
      </div>

      {truncated ? (
        <p className="text-amber-600 text-sm">
          Showing the hottest {voxels.length} cells. Increase voxel size for
          full coverage.
        </p>
      ) : null}

      <div className="h-[600px] w-full rounded-lg border bg-black/90">
        {activeScene.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No spatial data in this date range.
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                Loading 3D…
              </div>
            }
          >
            <VoxelCanvas
              useMetric={false}
              voxelSize={voxelSize}
              voxels={voxels}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default SpatialView;
```

> Confirm exact UI primitive import paths against an existing organism (`Select`, `Slider`, `Label` may live under slightly different paths in `@sbox-analytics/ui`). Confirm `isoDaysAgo`'s signature (the verbatim source used `isoDaysAgo(n)` returning a `YYYY-MM-DD` string). Confirm the oRPC query-options call style matches existing routes — the codebase uses `orpc.<ns>.<proc>.queryOptions({ input })`. If existing routes instead use `useQuery({ queryKey, queryFn })`, mirror that.

- [ ] **Step 3: Type-check**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/analytics/components/organisms/voxel-canvas.tsx apps/web/src/features/analytics/components/organisms/spatial-view.tsx
git commit -m "feat(web): spatial view + lazy voxel canvas"
```

---

## Task 9: Spatial route + navigation

**Files:**

- Create: `apps/web/src/routes/dashboard/projects/$projectId/spatial.tsx`

> Match the EXACT file-based-routing convention of sibling files in `apps/web/src/routes/dashboard/projects/$projectId/` (the verbatim source showed `createFileRoute("<path>")({ component })` and `Route.useParams()` for `projectId`). Copy a sibling route's header/breadcrumb wrapper if one exists.

- [ ] **Step 1: Create the route file**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import SpatialView from "@/features/analytics/components/organisms/spatial-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/spatial")({
  component: SpatialPage,
});

function SpatialPage() {
  const { projectId } = Route.useParams();
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="font-semibold text-2xl">Spatial Heatmap</h1>
      <SpatialView projectId={projectId} />
    </div>
  );
}
```

> If the project uses a generated route tree (`routeTree.gen.ts`), run the dev server or the route-gen step so the new route is registered. TanStack Router's Vite plugin regenerates on save.

- [ ] **Step 2: Add a nav link to the project dashboard**

Find the project's nav/sidebar/tab list (where links to `overview`, `sessions`, `maps` live — search `to="/dashboard/projects/$projectId/maps"`). Add an adjacent link:

```tsx
<Link params={{ projectId }} to="/dashboard/projects/$projectId/spatial">
  Spatial
</Link>
```

Match the exact `<Link>` styling/wrapper used by the sibling nav items.

- [ ] **Step 3: Manual smoke check**

Run: `cd apps/web && bun run dev`, open a project, click **Spatial**.
Expected: page loads; scene picker populates (after seeding spatial events — see Task 11 note); empty-state shows when no data; 3D canvas renders voxels.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/dashboard/projects/$projectId/spatial.tsx
git commit -m "feat(web): spatial heatmap route + nav link"
```

---

## Task 10: Public API documentation

**Files:**

- Create: `apps/fumadocs/content/docs/api/spatial.mdx`
- Modify: `apps/fumadocs/content/docs/api/events.mdx` (cross-link)

- [ ] **Step 1: Create `spatial.mdx`**

````mdx
---
title: Spatial Events
description: Emit 3D positions and render volumetric heatmaps of player behavior.
---

## Overview

Any event may carry an optional `position` (`{ x, y, z }`) and a `scene` name.
Events that include `position` are **spatial events** — they can be aggregated
into a 3D voxel grid and rendered as a volumetric heatmap, in the s&box scene
(via the C# SDK) or in the dashboard. Events without `position` are unaffected.

Coordinates are always interpreted within a `scene`; data from different scenes
is never mixed in one heatmap.

## Emitting a spatial event

Spatial events ride the existing `POST /v1/events` batch — no new endpoint.

```json
{
  "events": [
    {
      "type": "player_death",
      "session_id": "sess_abc123",
      "scene": "dm_arena",
      "position": { "x": 128.0, "y": -64.5, "z": 32.0 },
      "properties": { "fps": 58 }
    }
  ]
}
```
````

| Field      | Type                    | Required | Notes                                |
| ---------- | ----------------------- | -------- | ------------------------------------ |
| `position` | `{ x, y, z }` (numbers) | No       | Presence marks the event as spatial. |
| `scene`    | string (≤128)           | No       | Map/scene the coordinates belong to. |

## Querying voxels

The dashboard and the engine both consume the `spatial.voxels` payload:

- Input: `projectId`, `scene`, optional `eventType`, `voxelSize` (world units per
  cube edge), `from`/`to`, optional `metric` (`{ key, agg }` with agg ∈
  `avg|min|max|sum`, e.g. average `fps`), optional `bounds`, optional `limit`
  (max 50000).
- Output: `voxels[]` of `{ x, y, z, count, value }` where `x/y/z` is the cell
  center, `count` is event density, `value` is the aggregated metric (or `null`),
  plus a `truncated` flag when the limit is hit (hottest cells are kept).

Use `spatial.scenes` first to list scenes with spatial data and their coordinate
bounds, so you can frame the heatmap.

````

- [ ] **Step 2: Cross-link from `events.mdx`**

Add a sentence near the `properties` field description:

```mdx
> Need spatial heatmaps? Add a `position` and `scene` to your event — see [Spatial Events](/docs/api/spatial).
````

- [ ] **Step 3: Build docs to verify MDX**

Run: `cd apps/fumadocs && bun run build`
Expected: build succeeds, no MDX/link errors.

- [ ] **Step 4: Commit**

```bash
git add apps/fumadocs/content/docs/api/spatial.mdx apps/fumadocs/content/docs/api/events.mdx
git commit -m "docs: document spatial events + voxel query"
```

---

## Task 11: Demo seeding (optional but recommended for verification)

**Files:**

- Modify: the existing ClickHouse demo-seed script (the recent commit `feat(db): add demo seeding for ClickHouse + Postgres` added one — locate it under `packages/db` or a `scripts/`/`seed` path).

> Without spatial rows the dashboard shows only the empty-state, so seeding makes Task 9's smoke check meaningful.

- [ ] **Step 1: Add spatial rows to the seeder**

In the loop that generates demo events, set `scene` to one of a couple of fixed names and emit `pos_x/pos_y/pos_z` for a subset of event types (e.g. `player_death`, `player_move`). Cluster some deaths around a hotspot so the heatmap is visibly non-uniform. For `properties`, include an `fps` number on a `fps_sample` event type so the metric mode has data.

```ts
// within the per-event generation:
const isSpatial = ["player_death", "player_move", "fps_sample"].includes(type);
const scene = isSpatial
  ? Math.random() < 0.5
    ? "dm_arena"
    : "ctf_bridge"
  : "";
const pos = isSpatial
  ? {
      x: Math.round((Math.random() - 0.5) * 2000),
      y: Math.round((Math.random() - 0.5) * 2000),
      z: Math.round(Math.random() * 300),
    }
  : null;
```

Map these into the seeded row's `scene` / `pos_x` / `pos_y` / `pos_z` columns. Match the seeder's existing insert mechanism (direct CH insert vs. producing to Kafka).

- [ ] **Step 2: Re-seed + verify**

Run the seed command (check `package.json` scripts — likely `bun run seed` or a db package script).
Then: `docker compose exec -T clickhouse clickhouse-client -q "SELECT scene, count() FROM analytics.events WHERE pos_x IS NOT NULL GROUP BY scene"`
Expected: non-zero counts for `dm_arena` / `ctf_bridge`.

- [ ] **Step 3: Commit**

```bash
git add <seed-script-path>
git commit -m "feat(db): seed demo spatial events"
```

---

## Final Verification

- [ ] `cd apps/ingest && bun test` — schema + row-builder tests pass.
- [ ] `cd packages/api && bun test` — voxel/scenes builder tests pass.
- [ ] `cd packages/api && bunx tsc --noEmit` — types clean.
- [ ] `cd apps/web && bunx tsc --noEmit` — types clean.
- [ ] `bun x ultracite check` at repo root — lint/format clean (run `bun x ultracite fix` first).
- [ ] Manual: emit a spatial event via `POST /v1/events`, confirm it lands in `analytics.events` with populated `pos_*`/`scene`, then open the dashboard Spatial page and see voxels render.
- [ ] `.env.example` + `packages/env` schemas updated IF any env var was introduced (none expected).

## Spec Coverage Check

| Spec section                                                           | Task(s)         |
| ---------------------------------------------------------------------- | --------------- |
| §2.1 contract `position`/`scene`                                       | 1               |
| §2.2 ClickHouse columns + MV                                           | 3               |
| §2.3 ingest writer mapping                                             | 1, 2            |
| §2.4 migration                                                         | 4               |
| §3.1 `spatial.scenes`                                                  | 5, 6            |
| §3.2 `spatial.voxels` + binning                                        | 5, 6            |
| §3.3 guardrails (voxelSize>0, limit cap, bound params, agg allow-list) | 5, 6            |
| §3.4 helper extraction (`spatial-query.ts`)                            | 5               |
| §4 dashboard 3D viz                                                    | 7, 8, 9         |
| §4.5 engine parity (shared payload)                                    | 6, 10           |
| §5 docs                                                                | 10              |
| §7 testing strategy                                                    | 1, 5, 8 (smoke) |
