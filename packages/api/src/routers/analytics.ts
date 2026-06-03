import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import { clickhouse } from "../clickhouse";
import { protectedProcedure } from "../index";
import type { ColumnFilterDef } from "../query-builder";
import {
  applyFilters,
  buildColumnFilters,
  filterSchema,
} from "../query-builder";
import {
  buildScenesQuery,
  buildVoxelsQuery,
  voxelCenter,
} from "../spatial-query";

const dailyInput = z.object({
  from: z.iso.date(),
  projectId: z.string().min(1),
  to: z.iso.date(),
});

const dailyRow = z.object({
  event_count: z.coerce.number(),
  event_date: z.string(),
  event_type: z.string(),
  unique_players: z.coerce.number(),
  unique_sessions: z.coerce.number(),
});

const eventsRow = z.object({
  event_count: z.coerce.number(),
  event_type: z.string(),
  unique_players: z.coerce.number(),
});

const breakdownInput = z.object({
  filters: z.array(filterSchema).max(10).optional(),
  from: z.iso.date(),
  joinOperator: z.enum(["and", "or"]).default("and"),
  projectId: z.string().min(1),
  sortBy: z
    .enum(["event_type", "event_count", "unique_players"])
    .default("event_count"),
  sortDesc: z.boolean().default(true),
  to: z.iso.date(),
});

// Filterable columns for the event-type breakdown. event_type is the GROUP BY
// key; the other two are aggregate aliases — all are referenced via HAVING.
const BREAKDOWN_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  event_count: { expr: "event_count", type: "number" },
  event_type: { expr: "event_type", type: "string" },
  unique_players: { expr: "unique_players", type: "number" },
};

const playersInput = z.object({
  from: z.iso.date(),
  projectId: z.string().min(1),
  to: z.iso.date(),
});

const playersDailyRow = z.object({
  dau: z.coerce.number(),
  event_date: z.string(),
  new_players: z.coerce.number(),
  returning_players: z.coerce.number(),
});

const playersTotalsRow = z.object({
  mau: z.coerce.number(),
  wau: z.coerce.number(),
});

const playersOutput = z.object({
  daily: z.array(playersDailyRow),
  mau: z.coerce.number(),
  wau: z.coerce.number(),
});

const sessionsInput = z.object({
  from: z.iso.date(),
  projectId: z.string().min(1),
  to: z.iso.date(),
});

const sessionsHistogramRow = z.object({
  bucket: z.string(),
  sessions: z.coerce.number(),
  sort: z.coerce.number(),
});

const sessionsTrendRow = z.object({
  avg_seconds: z.coerce.number(),
  event_date: z.string(),
});

const sessionsHeatmapRow = z.object({
  hour: z.coerce.number(),
  sessions: z.coerce.number(),
  weekday: z.coerce.number(),
});

const sessionsOutput = z.object({
  heatmap: z.array(sessionsHeatmapRow),
  histogram: z.array(sessionsHistogramRow),
  trend: z.array(sessionsTrendRow),
});

const mapsInput = z.object({
  filters: z.array(filterSchema).max(10).optional(),
  from: z.iso.date(),
  joinOperator: z.enum(["and", "or"]).default("and"),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(10),
  projectId: z.string().min(1),
  sortBy: z.enum(["map", "sessions", "players", "avg_seconds"]).optional(),
  sortDesc: z.boolean().default(true),
  to: z.iso.date(),
});

const mapsBreakdownRow = z.object({
  avg_seconds: z.coerce.number(),
  map: z.string(),
  players: z.coerce.number(),
  sessions: z.coerce.number(),
});

// Filterable/sortable columns for the per-map table. `map` is the GROUP BY key;
// the rest are aggregate aliases — all referenced via HAVING / ORDER BY.
const MAPS_TABLE_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  avg_seconds: { expr: "avg_seconds", type: "number" },
  map: { expr: "map", type: "string" },
  players: { expr: "players", type: "number" },
  sessions: { expr: "sessions", type: "number" },
};

const mapsOverTimeRow = z.object({
  event_date: z.string(),
  map: z.string(),
  sessions: z.coerce.number(),
});

const mapsOutput = z.object({
  // Top-N maps by sessions, unaffected by table paging — drives the charts.
  breakdown: z.array(mapsBreakdownRow),
  overTime: z.array(mapsOverTimeRow),
  // Server-side filtered/sorted/paginated rows for the data-table.
  table: z.object({
    rows: z.array(mapsBreakdownRow),
    total: z.coerce.number(),
  }),
});

const retentionInput = z.object({
  filters: z.array(filterSchema).max(10).optional(),
  from: z.iso.date(),
  joinOperator: z.enum(["and", "or"]).default("and"),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(10),
  projectId: z.string().min(1),
  sortBy: z.enum(["cohort_date", "size", "d1", "d7", "d30"]).optional(),
  sortDesc: z.boolean().default(true),
  to: z.iso.date(),
});

// d1/d7/d30 are whole-percent retention rates (not raw counts), so the cohort
// table sorts/filters on the same numbers it displays.
const retentionCohortRow = z.object({
  cohort_date: z.string(),
  d1: z.coerce.number(),
  d30: z.coerce.number(),
  d7: z.coerce.number(),
  size: z.coerce.number(),
});

// Cohort table columns: cohort_date is the GROUP BY key, the rest are aggregate
// aliases — all referenced via HAVING / ORDER BY.
const RETENTION_COHORT_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  cohort_date: { expr: "cohort_date", type: "string" },
  d1: { expr: "d1", type: "number" },
  d30: { expr: "d30", type: "number" },
  d7: { expr: "d7", type: "number" },
  size: { expr: "size", type: "number" },
};

const retentionCurveRow = z.object({
  day_offset: z.coerce.number(),
  retained: z.coerce.number(),
});

const retentionOutput = z.object({
  curve: z.array(retentionCurveRow),
  table: z.object({
    rows: z.array(retentionCohortRow),
    total: z.coerce.number(),
  }),
});

const MIN_FUNNEL_STEPS = 2;
const MAX_FUNNEL_STEPS = 8;
const DEFAULT_FUNNEL_WINDOW_SECONDS = 86_400;

const funnelsInput = z.object({
  from: z.iso.date(),
  projectId: z.string().min(1),
  steps: z.array(z.string().min(1)).min(MIN_FUNNEL_STEPS).max(MAX_FUNNEL_STEPS),
  to: z.iso.date(),
  windowSeconds: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_FUNNEL_WINDOW_SECONDS),
});

const funnelsLevelRow = z.object({
  level: z.coerce.number(),
  players: z.coerce.number(),
});

const funnelsTrendRow = z.object({
  completed: z.coerce.number(),
  day: z.string(),
  started: z.coerce.number(),
});

const funnelsStep = z.object({
  event_type: z.string(),
  reached: z.number(),
  step: z.number(),
});

const funnelsOutput = z.object({
  steps: z.array(funnelsStep),
  trend: z.array(funnelsTrendRow),
});

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
      organizationId: project.organizationId,
      userId,
    },
  });

  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "Project not accessible" });
  }
}

const performanceInput = z.object({
  from: z.iso.date(),
  mapFilters: z.array(filterSchema).max(10).optional(),
  mapJoinOperator: z.enum(["and", "or"]).default("and"),
  mapSortBy: z.enum(["map", "avg_fps", "p95_fps", "crashes"]).optional(),
  mapSortDesc: z.boolean().default(false),
  projectId: z.string().min(1),
  to: z.iso.date(),
});

// Filterable columns for the per-map performance table — all are SELECT aliases
// over aggregates, so they are applied via HAVING alongside the `map != ''` guard.
const PERFORMANCE_MAP_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  avg_fps: { expr: "avg_fps", type: "number" },
  crashes: { expr: "crashes", type: "number" },
  map: { expr: "map", type: "string" },
  p95_fps: { expr: "p95_fps", type: "number" },
};

const performanceFpsRow = z.object({
  event_date: z.string(),
  p50: z.coerce.number(),
  p95: z.coerce.number(),
  p99: z.coerce.number(),
});

const performanceCrashRow = z.object({
  crash_rate: z.coerce.number(),
  crashes: z.coerce.number(),
  event_date: z.string(),
  sessions: z.coerce.number(),
});

const performanceLoadBucketRow = z.object({
  bucket: z.string(),
  count: z.coerce.number(),
});

const performanceMapRow = z.object({
  avg_fps: z.coerce.number(),
  crashes: z.coerce.number(),
  map: z.string(),
  p95_fps: z.coerce.number(),
});

const performanceOutput = z.object({
  byMap: z.array(performanceMapRow),
  crashes: z.array(performanceCrashRow),
  fps: z.array(performanceFpsRow),
  loadHistogram: z.array(performanceLoadBucketRow),
});

const playerProfileInput = z.object({
  playerId: z.string().min(1),
  projectId: z.string().min(1),
  sessionsFilters: z.array(filterSchema).max(10).optional(),
  sessionsJoinOperator: z.enum(["and", "or"]).default("and"),
  sessionsPage: z.number().int().min(1).default(1),
  sessionsPerPage: z.number().int().min(1).max(100).default(10),
  sessionsSortBy: z
    .enum(["started_at", "duration_seconds", "event_count"])
    .optional(),
  sessionsSortDesc: z.boolean().default(true),
});

// Filterable columns for a player's session history — all per-session aggregate
// aliases, applied via HAVING (and mirrored into the paginated count subquery).
const PLAYER_SESSION_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  duration_seconds: { expr: "duration_seconds", type: "number" },
  event_count: { expr: "event_count", type: "number" },
  map: { expr: "map", type: "string" },
  started_at: { expr: "started_at", type: "string" },
};

const playerLifetimeRow = z.object({
  active_days: z.coerce.number(),
  first_seen: z.string(),
  last_seen: z.string(),
  total_events: z.coerce.number(),
  total_sessions: z.coerce.number(),
});

const playerSessionRow = z.object({
  duration_seconds: z.coerce.number(),
  ended_at: z.string(),
  event_count: z.coerce.number(),
  map: z.string(),
  session_id: z.string(),
  started_at: z.string(),
});

const playerTimelineRow = z.object({
  event_type: z.string(),
  properties: z.string(),
  session_id: z.string(),
  timestamp: z.string(),
});

const playerProfileOutput = z.object({
  lifetime: playerLifetimeRow,
  sessions: z.array(playerSessionRow),
  sessionsTotal: z.coerce.number(),
  timeline: z.array(playerTimelineRow),
});

const spatialScenesInput = z.object({
  from: z.iso.date(),
  projectId: z.string().min(1),
  to: z.iso.date(),
});

const spatialSceneRow = z.object({
  eventCount: z.coerce.number(),
  maxX: z.coerce.number(),
  maxY: z.coerce.number(),
  maxZ: z.coerce.number(),
  minX: z.coerce.number(),
  minY: z.coerce.number(),
  minZ: z.coerce.number(),
  scene: z.string(),
});

const spatialScenesOutput = z.object({
  scenes: z.array(
    z.object({
      bounds: z.object({
        maxX: z.number(),
        maxY: z.number(),
        maxZ: z.number(),
        minX: z.number(),
        minY: z.number(),
        minZ: z.number(),
      }),
      eventCount: z.number(),
      scene: z.string(),
    })
  ),
});

const voxelMetricInput = z.object({
  agg: z.enum(["avg", "min", "max", "sum"]),
  key: z.string().min(1),
});

const voxelBoundsInput = z.object({
  maxX: z.number(),
  maxY: z.number(),
  maxZ: z.number(),
  minX: z.number(),
  minY: z.number(),
  minZ: z.number(),
});

const MAX_VOXELS = 50_000;

const spatialVoxelsInput = z.object({
  bounds: voxelBoundsInput.optional(),
  eventType: z.string().min(1).optional(),
  from: z.iso.date(),
  limit: z.number().int().positive().max(MAX_VOXELS).default(MAX_VOXELS),
  metric: voxelMetricInput.optional(),
  projectId: z.string().min(1),
  scene: z.string().min(1),
  to: z.iso.date(),
  voxelSize: z.number().positive(),
});

const voxelRow = z.object({
  count: z.coerce.number(),
  gx: z.coerce.number(),
  gy: z.coerce.number(),
  gz: z.coerce.number(),
  value: z.coerce.number().nullable(),
});

const spatialVoxelsOutput = z.object({
  truncated: z.boolean(),
  voxelSize: z.number(),
  voxels: z.array(
    z.object({
      count: z.number(),
      value: z.number().nullable(),
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
  ),
});

export const analyticsRouter = {
  // Daily rollup powered by the AggregatingMergeTree in ClickHouse.
  daily: protectedProcedure
    .input(dailyInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const result = await clickhouse().query({
        format: "JSON",
        query: `
          SELECT
            event_date                       AS event_date,
            event_type                        AS event_type,
            toUInt64(uniqMerge(unique_players))  AS unique_players,
            toUInt64(uniqMerge(unique_sessions)) AS unique_sessions,
            toUInt64(countMerge(event_count))    AS event_count
          FROM analytics.events_daily
          WHERE project_id = {projectId:String}
            AND event_date BETWEEN {from:Date} AND {to:Date}
          GROUP BY event_date, event_type
          ORDER BY event_date, event_type
        `,
        query_params: input,
      });

      const json = await result.json<z.infer<typeof dailyRow>>();
      return z.array(dailyRow).parse(json.data);
    }),

  // DAU + new-vs-returning daily series, plus trailing WAU/MAU.
  players: protectedProcedure
    .input(playersInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const ch = clickhouse();

      const [dailyResult, totalsResult] = await Promise.all([
        ch.query({
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
        }),
        ch.query({
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
        }),
      ]);

      const dailyJson =
        await dailyResult.json<z.infer<typeof playersDailyRow>>();
      const daily = z.array(playersDailyRow).parse(dailyJson.data);

      const totalsJson =
        await totalsResult.json<z.infer<typeof playersTotalsRow>>();
      const totals = z.array(playersTotalsRow).parse(totalsJson.data)[0] ?? {
        mau: 0,
        wau: 0,
      };

      return playersOutput.parse({ daily, mau: totals.mau, wau: totals.wau });
    }),

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
            maxMerge(ended_at) AS ended_at,
            dateDiff('second', started_at, ended_at) AS duration
          FROM analytics.sessions_summary
          WHERE project_id = {projectId:String}
            AND event_date BETWEEN {from:Date} AND {to:Date}
          GROUP BY session_id, event_date
        )`;

      const [histogramResult, trendResult, heatmapResult] = await Promise.all([
        ch.query({
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
        }),
        ch.query({
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
        }),
        ch.query({
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
        }),
      ]);

      const histogramJson =
        await histogramResult.json<z.infer<typeof sessionsHistogramRow>>();
      const histogram = z.array(sessionsHistogramRow).parse(histogramJson.data);

      const trendJson =
        await trendResult.json<z.infer<typeof sessionsTrendRow>>();
      const trend = z.array(sessionsTrendRow).parse(trendJson.data);

      const heatmapJson =
        await heatmapResult.json<z.infer<typeof sessionsHeatmapRow>>();
      const heatmap = z.array(sessionsHeatmapRow).parse(heatmapJson.data);

      return sessionsOutput.parse({ heatmap, histogram, trend });
    }),

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

      const MAPS_SORT_COLS = {
        avg_seconds: "avg_seconds",
        map: "map",
        players: "players",
        sessions: "sessions",
      } as const;
      const tableSortCol = input.sortBy
        ? (MAPS_SORT_COLS[input.sortBy] ?? "sessions")
        : "sessions";
      const tableSortDir = input.sortDesc ? "DESC" : "ASC";
      const tableOffset = (input.page - 1) * input.perPage;

      // Aggregate-alias filters apply via HAVING, mirrored into the count query
      // so pagination reflects the filtered total. Each query binds into its own
      // param object so the generated filter param names never collide.
      const tableParams: Record<string, unknown> = {
        from: input.from,
        offset: tableOffset,
        perPage: input.perPage,
        projectId: input.projectId,
        to: input.to,
      };
      const tableFilter = buildColumnFilters(
        input.filters,
        MAPS_TABLE_FILTER_COLUMNS,
        tableParams,
        input.joinOperator
      );
      const tableHaving = tableFilter ? `HAVING ${tableFilter}` : "";

      const countParams: Record<string, unknown> = {
        from: input.from,
        projectId: input.projectId,
        to: input.to,
      };
      const countFilter = buildColumnFilters(
        input.filters,
        MAPS_TABLE_FILTER_COLUMNS,
        countParams,
        input.joinOperator
      );
      const countHaving = countFilter ? `HAVING ${countFilter}` : "";

      const tableSelect = `
        SELECT
          m.map                            AS map,
          toUInt64(uniq(m.session_id))     AS sessions,
          toUInt64(uniq(m.player_id))      AS players,
          toUInt64(round(avg(d.duration))) AS avg_seconds
        FROM session_maps AS m
        LEFT JOIN durations AS d USING (session_id)
        WHERE m.map != ''
        GROUP BY m.map`;

      const [breakdownResult, overTimeResult, tableResult, tableCountResult] =
        await Promise.all([
          ch.query({
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
          }),
          ch.query({
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
          }),
          ch.query({
            format: "JSON",
            query: `${mapsCte}
            ${tableSelect}
            ${tableHaving}
            ORDER BY ${tableSortCol} ${tableSortDir}
            LIMIT {perPage:UInt32} OFFSET {offset:UInt32}
          `,
            query_params: tableParams,
          }),
          ch.query({
            format: "JSON",
            query: `
            SELECT count() AS total FROM (
              ${mapsCte}
              ${tableSelect}
              ${countHaving}
            )
          `,
            query_params: countParams,
          }),
        ]);

      const breakdownJson =
        await breakdownResult.json<z.infer<typeof mapsBreakdownRow>>();
      const breakdown = z.array(mapsBreakdownRow).parse(breakdownJson.data);

      const overTimeJson =
        await overTimeResult.json<z.infer<typeof mapsOverTimeRow>>();
      const overTime = z.array(mapsOverTimeRow).parse(overTimeJson.data);

      const tableJson =
        await tableResult.json<z.infer<typeof mapsBreakdownRow>>();
      const tableRows = z.array(mapsBreakdownRow).parse(tableJson.data);
      const tableCountJson = await tableCountResult.json<{ total: string }>();
      const tableTotal = Number(tableCountJson.data[0]?.total ?? 0);

      return mapsOutput.parse({
        breakdown,
        overTime,
        table: { rows: tableRows, total: tableTotal },
      });
    }),

  // Cohort retention: day-1/7/30 per first-seen cohort plus a maturity-gated
  // average retention curve. Cohort date comes from player_first_seen; return
  // activity comes from raw events.
  retention: protectedProcedure
    .input(retentionInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const ch = clickhouse();
      const retentionCte = `
        WITH cohorts AS (
          SELECT player_id, minMerge(first_seen) AS cohort_date
          FROM analytics.player_first_seen
          WHERE project_id = {projectId:String}
          GROUP BY player_id
          HAVING cohort_date BETWEEN {from:Date} AND {to:Date}
        ),
        activity AS (
          SELECT DISTINCT player_id, toDate(timestamp) AS active_date
          FROM analytics.events
          WHERE project_id = {projectId:String}
            AND toDate(timestamp) BETWEEN {from:Date} AND addDays({to:Date}, 30)
        ),
        joined AS (
          SELECT
            c.cohort_date AS cohort_date,
            c.player_id   AS player_id,
            dateDiff('day', c.cohort_date, a.active_date) AS day_offset
          FROM cohorts AS c
          INNER JOIN activity AS a USING (player_id)
          WHERE a.active_date >= c.cohort_date
            AND dateDiff('day', c.cohort_date, a.active_date) <= 30
        )
      `;

      const RETENTION_SORT_COLS = {
        cohort_date: "cohort_date",
        d1: "d1",
        d30: "d30",
        d7: "d7",
        size: "size",
      } as const;
      const tableSortCol = input.sortBy
        ? (RETENTION_SORT_COLS[input.sortBy] ?? "cohort_date")
        : "cohort_date";
      const tableSortDir = input.sortDesc ? "DESC" : "ASC";
      const tableOffset = (input.page - 1) * input.perPage;

      // d1/d7/d30 are emitted as whole-percent retention rates so the table
      // sorts/filters on the same numbers it displays. nullIf guards the
      // empty-cohort divide.
      const cohortSelect = `
        SELECT
          toString(cohort_date)                            AS cohort_date,
          toUInt64(uniqExactIf(player_id, day_offset = 0)) AS size,
          ifNull(round(uniqExactIf(player_id, day_offset = 1)  / nullIf(uniqExactIf(player_id, day_offset = 0), 0) * 100), 0) AS d1,
          ifNull(round(uniqExactIf(player_id, day_offset = 7)  / nullIf(uniqExactIf(player_id, day_offset = 0), 0) * 100), 0) AS d7,
          ifNull(round(uniqExactIf(player_id, day_offset = 30) / nullIf(uniqExactIf(player_id, day_offset = 0), 0) * 100), 0) AS d30
        FROM joined
        GROUP BY cohort_date`;

      const tableParams: Record<string, unknown> = {
        from: input.from,
        offset: tableOffset,
        perPage: input.perPage,
        projectId: input.projectId,
        to: input.to,
      };
      const tableFilter = buildColumnFilters(
        input.filters,
        RETENTION_COHORT_FILTER_COLUMNS,
        tableParams,
        input.joinOperator
      );
      const tableHaving = tableFilter ? `HAVING ${tableFilter}` : "";

      const countParams: Record<string, unknown> = {
        from: input.from,
        projectId: input.projectId,
        to: input.to,
      };
      const countFilter = buildColumnFilters(
        input.filters,
        RETENTION_COHORT_FILTER_COLUMNS,
        countParams,
        input.joinOperator
      );
      const countHaving = countFilter ? `HAVING ${countFilter}` : "";

      const [tableResult, tableCountResult, curveResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: `${retentionCte}
            ${cohortSelect}
            ${tableHaving}
            ORDER BY ${tableSortCol} ${tableSortDir}
            LIMIT {perPage:UInt32} OFFSET {offset:UInt32}
          `,
          query_params: tableParams,
        }),
        ch.query({
          format: "JSON",
          query: `
            SELECT count() AS total FROM (
              ${retentionCte}
              ${cohortSelect}
              ${countHaving}
            )
          `,
          query_params: countParams,
        }),
        ch.query({
          format: "JSON",
          query: `${retentionCte}
            SELECT
              day_offset,
              toUInt64(uniqExact(player_id)) AS retained
            FROM joined
            WHERE cohort_date <= {to:Date} - 30
            GROUP BY day_offset
            ORDER BY day_offset
          `,
          query_params: input,
        }),
      ]);

      const tableJson =
        await tableResult.json<z.infer<typeof retentionCohortRow>>();
      const tableRows = z.array(retentionCohortRow).parse(tableJson.data);
      const tableCountJson = await tableCountResult.json<{ total: string }>();
      const tableTotal = Number(tableCountJson.data[0]?.total ?? 0);
      const curveJson =
        await curveResult.json<z.infer<typeof retentionCurveRow>>();
      const curve = z.array(retentionCurveRow).parse(curveJson.data);

      return retentionOutput.parse({
        curve,
        table: { rows: tableRows, total: tableTotal },
      });
    }),

  // Ad-hoc funnel over user-defined ordered event steps. windowFunnel returns
  // the furthest consecutive step each player reached; per-step counts and a
  // first-touch conversion trend are derived from that.
  funnels: protectedProcedure
    .input(funnelsInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const ch = clickhouse();
      const conditions = input.steps
        .map((_step, index) => `event_type = {s${index}:String}`)
        .join(", ");
      const stepParams = Object.fromEntries(
        input.steps.map((value, index) => [`s${index}`, value])
      );
      const params = {
        from: input.from,
        projectId: input.projectId,
        steps: input.steps,
        to: input.to,
        window: input.windowSeconds,
        ...stepParams,
      };

      const levelsCte = `
        WITH levels AS (
          SELECT
            player_id,
            toDate(min(timestamp)) AS first_day,
            windowFunnel({window:UInt32})(timestamp, ${conditions}) AS level
          FROM analytics.events
          WHERE project_id = {projectId:String}
            AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
            AND event_type IN {steps:Array(String)}
          GROUP BY player_id
        )
      `;

      const [levelsResult, trendResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: `${levelsCte}
            SELECT level, toUInt64(count()) AS players
            FROM levels
            WHERE level > 0
            GROUP BY level
            ORDER BY level
          `,
          query_params: params,
        }),
        ch.query({
          format: "JSON",
          query: `${levelsCte}
            SELECT
              toString(first_day)                            AS day,
              toUInt64(count())                              AS started,
              toUInt64(countIf(level >= {fullLevel:UInt8}))  AS completed
            FROM levels
            WHERE level > 0
            GROUP BY first_day
            ORDER BY first_day
          `,
          query_params: { ...params, fullLevel: input.steps.length },
        }),
      ]);

      const levelsJson =
        await levelsResult.json<z.infer<typeof funnelsLevelRow>>();
      const levelCounts = z.array(funnelsLevelRow).parse(levelsJson.data);
      const trendJson =
        await trendResult.json<z.infer<typeof funnelsTrendRow>>();
      const trend = z.array(funnelsTrendRow).parse(trendJson.data);

      // Players reaching step i (0-indexed) are those whose funnel level is at
      // least i + 1, since windowFunnel uses 1-indexed levels.
      const steps = input.steps.map((eventType, index) => {
        const minLevel = index + 1;
        const reached = levelCounts
          .filter((row) => row.level >= minLevel)
          .reduce((sum, row) => sum + row.players, 0);
        return { event_type: eventType, reached, step: index };
      });

      return funnelsOutput.parse({ steps, trend });
    }),

  // Aggregated event-type totals over a date window — backs the Events table.
  breakdown: protectedProcedure
    .input(breakdownInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const BREAKDOWN_SORT_COLS = {
        event_count: "event_count",
        event_type: "event_type",
        unique_players: "unique_players",
      } as const;
      const sortCol = BREAKDOWN_SORT_COLS[input.sortBy] ?? "event_count";
      const sortDir = input.sortDesc ? "DESC" : "ASC";

      const params: Record<string, unknown> = {
        from: input.from,
        projectId: input.projectId,
        to: input.to,
      };
      const having = buildColumnFilters(
        input.filters,
        BREAKDOWN_FILTER_COLUMNS,
        params,
        input.joinOperator
      );
      const havingClause = having ? `HAVING ${having}` : "";

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
          ${havingClause}
          ORDER BY ${sortCol} ${sortDir}
        `,
        query_params: params,
      });

      const json = await result.json<z.infer<typeof eventsRow>>();
      return z.array(eventsRow).parse(json.data);
    }),

  // Most recent raw events — for the dashboard's live stream view.
  recent: protectedProcedure
    .input(
      z.object({
        filters: z.array(filterSchema).max(10).optional(),
        from: z.iso.datetime().optional(),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(20),
        projectId: z.string().min(1),
        sortBy: z.string().optional(),
        sortDesc: z.boolean().default(false),
        to: z.iso.datetime().optional(),
      })
    )
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const SAFE_SORT_COLUMNS = new Set([
        "timestamp",
        "event_type",
        "player_id",
        "session_id",
      ]);
      const sortCol =
        input.sortBy && SAFE_SORT_COLUMNS.has(input.sortBy)
          ? input.sortBy
          : "timestamp";
      const sortDir = input.sortDesc ? "DESC" : "ASC";
      const offset = (input.page - 1) * input.perPage;

      const params: Record<string, unknown> = {
        offset,
        perPage: input.perPage,
        projectId: input.projectId,
      };
      const conditions = ["project_id = {projectId:String}"];
      if (input.from && input.to) {
        conditions.push(
          "timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}"
        );
        // ClickHouse DateTime64 rejects the ISO `Z` suffix; the column is
        // already UTC, so dropping it preserves the instant.
        params.from = input.from.replace(/Z$/u, "");
        params.to = input.to.replace(/Z$/u, "");
      }
      for (const condition of applyFilters(input.filters, params)) {
        conditions.push(condition);
      }

      const whereClause = conditions.join(" AND ");
      const ch = clickhouse();

      const [result, countResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: `
            SELECT
              event_type,
              timestamp,
              session_id,
              player_id,
              properties
            FROM analytics.events
            WHERE ${whereClause}
            ORDER BY ${sortCol} ${sortDir}
            LIMIT {perPage:UInt32} OFFSET {offset:UInt32}
          `,
          query_params: params,
        }),
        ch.query({
          format: "JSON",
          query: `
            SELECT count() AS total
            FROM analytics.events
            WHERE ${whereClause}
          `,
          query_params: params,
        }),
      ]);

      const json = await result.json<{
        event_type: string;
        timestamp: string;
        session_id: string;
        player_id: string;
        properties: string;
      }>();
      const countJson = await countResult.json<{ total: string }>();

      return {
        rows: json.data,
        total: Number(countJson.data[0]?.total ?? 0),
      };
    }),

  performance: protectedProcedure
    .input(performanceInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const MAP_SORT_COLS = {
        avg_fps: "avg_fps",
        crashes: "crashes",
        map: "map",
        p95_fps: "p95_fps",
      } as const;
      const mapSortCol = input.mapSortBy
        ? (MAP_SORT_COLS[input.mapSortBy] ?? "avg_fps")
        : "avg_fps";
      const mapSortDir = input.mapSortDesc ? "DESC" : "ASC";
      const chParams = {
        from: input.from,
        projectId: input.projectId,
        to: input.to,
      };

      // byMap filters apply to aggregate aliases, so they extend the HAVING
      // clause. Bind into a dedicated param object scoped to that one query.
      const byMapParams: Record<string, unknown> = { ...chParams };
      const mapFilterCondition = buildColumnFilters(
        input.mapFilters,
        PERFORMANCE_MAP_FILTER_COLUMNS,
        byMapParams,
        input.mapJoinOperator
      );
      const mapHaving = mapFilterCondition
        ? `map != '' AND ${mapFilterCondition}`
        : "map != ''";

      const ch = clickhouse();
      const [fpsResult, crashResult, loadResult, byMapResult] =
        await Promise.all([
          ch.query({
            format: "JSON",
            query: `
              SELECT
                toDate(timestamp) AS event_date,
                round(quantile(0.5)(JSONExtractFloat(properties, 'fps')), 1) AS p50,
                round(quantile(0.95)(JSONExtractFloat(properties, 'fps')), 1) AS p95,
                round(quantile(0.99)(JSONExtractFloat(properties, 'fps')), 1) AS p99
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND event_type = 'fps_sample'
                AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
              GROUP BY event_date
              ORDER BY event_date
            `,
            query_params: chParams,
          }),
          ch.query({
            format: "JSON",
            query: `
              SELECT
                toDate(timestamp) AS event_date,
                countIf(event_type = 'crash') AS crashes,
                uniq(session_id) AS sessions,
                round(countIf(event_type = 'crash') / uniq(session_id), 4) AS crash_rate
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
              GROUP BY event_date
              ORDER BY event_date
            `,
            query_params: chParams,
          }),
          ch.query({
            format: "JSON",
            query: `
              WITH JSONExtractFloat(properties, 'ms') AS ms
              SELECT
                multiIf(ms < 100, '<100ms', ms < 250, '100-250ms', ms < 500, '250-500ms', ms < 1000, '500ms-1s', ms < 2000, '1-2s', ms < 5000, '2-5s', '5s+') AS bucket,
                multiIf(ms < 100, 0, ms < 250, 1, ms < 500, 2, ms < 1000, 3, ms < 2000, 4, ms < 5000, 5, 6) AS bucket_index,
                count() AS count
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND event_type = 'load_complete'
                AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
              GROUP BY bucket, bucket_index
              ORDER BY bucket_index
            `,
            query_params: chParams,
          }),
          ch.query({
            format: "JSON",
            query: `
              SELECT
                JSONExtractString(properties, 'map') AS map,
                round(avgIf(JSONExtractFloat(properties, 'fps'), event_type = 'fps_sample'), 1) AS avg_fps,
                round(quantileIf(0.95)(JSONExtractFloat(properties, 'fps'), event_type = 'fps_sample'), 1) AS p95_fps,
                countIf(event_type = 'crash') AS crashes
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND event_type IN ('fps_sample', 'crash')
                AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
              GROUP BY map
              HAVING ${mapHaving}
              ORDER BY ${mapSortCol} ${mapSortDir}
              LIMIT 50
            `,
            query_params: byMapParams,
          }),
        ]);

      const [fpsJson, crashJson, loadJson, byMapJson] = await Promise.all([
        fpsResult.json<z.infer<typeof performanceFpsRow>>(),
        crashResult.json<z.infer<typeof performanceCrashRow>>(),
        loadResult.json<z.infer<typeof performanceLoadBucketRow>>(),
        byMapResult.json<z.infer<typeof performanceMapRow>>(),
      ]);

      return performanceOutput.parse({
        byMap: byMapJson.data,
        crashes: crashJson.data,
        fps: fpsJson.data,
        loadHistogram: loadJson.data,
      });
    }),

  playerProfile: protectedProcedure
    .input(playerProfileInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const ch = clickhouse();

      const sessionsSortColumn = input.sessionsSortBy ?? "started_at";
      const sessionsSortDir = input.sessionsSortDesc ? "DESC" : "ASC";
      const sessionsOffset = (input.sessionsPage - 1) * input.sessionsPerPage;

      // Session filters target per-session aggregate aliases, so they go in
      // HAVING — applied to both the page query and the count subquery so
      // pagination reflects the filtered total.
      const sessionsParams: Record<string, unknown> = {
        playerId: input.playerId,
        projectId: input.projectId,
        sessionsOffset,
        sessionsPerPage: input.sessionsPerPage,
      };
      const sessionsFilterCondition = buildColumnFilters(
        input.sessionsFilters,
        PLAYER_SESSION_FILTER_COLUMNS,
        sessionsParams,
        input.sessionsJoinOperator
      );
      const sessionsHavingClause = sessionsFilterCondition
        ? `HAVING ${sessionsFilterCondition}`
        : "";

      const [
        lifetimeResult,
        sessionsResult,
        sessionsCountResult,
        timelineResult,
      ] = await Promise.all([
        ch.query({
          format: "JSON",
          query: `
              SELECT
                toString(min(timestamp)) AS first_seen,
                toString(max(timestamp)) AS last_seen,
                count() AS total_events,
                uniq(session_id) AS total_sessions,
                uniq(toDate(timestamp)) AS active_days
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND player_id = {playerId:String}
            `,
          query_params: input,
        }),
        ch.query({
          format: "JSON",
          query: `
              SELECT
                session_id,
                toString(min(timestamp)) AS started_at,
                toString(max(timestamp)) AS ended_at,
                dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds,
                count() AS event_count,
                argMin(JSONExtractString(properties, 'map'), timestamp) AS map
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND player_id = {playerId:String}
              GROUP BY session_id
              ${sessionsHavingClause}
              ORDER BY ${sessionsSortColumn} ${sessionsSortDir}
              LIMIT {sessionsPerPage:Int32}
              OFFSET {sessionsOffset:Int32}
            `,
          query_params: sessionsParams,
        }),
        ch.query({
          format: "JSON",
          query: `
              SELECT count() AS total
              FROM (
                SELECT
                  session_id,
                  toString(min(timestamp)) AS started_at,
                  dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds,
                  count() AS event_count,
                  argMin(JSONExtractString(properties, 'map'), timestamp) AS map
                FROM analytics.events
                WHERE project_id = {projectId:String}
                  AND player_id = {playerId:String}
                GROUP BY session_id
                ${sessionsHavingClause}
              )
            `,
          query_params: sessionsParams,
        }),
        ch.query({
          format: "JSON",
          query: `
              SELECT
                event_type,
                toString(timestamp) AS timestamp,
                session_id,
                properties
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND player_id = {playerId:String}
              ORDER BY timestamp DESC
              LIMIT 100
            `,
          query_params: input,
        }),
      ]);

      const [lifetimeJson, sessionsJson, sessionsCountJson, timelineJson] =
        await Promise.all([
          lifetimeResult.json<z.infer<typeof playerLifetimeRow>>(),
          sessionsResult.json<z.infer<typeof playerSessionRow>>(),
          sessionsCountResult.json<{ total: number }>(),
          timelineResult.json<z.infer<typeof playerTimelineRow>>(),
        ]);

      return playerProfileOutput.parse({
        lifetime: lifetimeJson.data[0],
        sessions: sessionsJson.data,
        sessionsTotal: sessionsCountJson.data[0]?.total ?? 0,
        timeline: timelineJson.data,
      });
    }),
  spatial: {
    scenes: protectedProcedure
      .input(spatialScenesInput)
      .handler(async ({ context, input }) => {
        await assertProjectAccess(input.projectId, context.session.user.id);
        const { query, params } = buildScenesQuery(input);
        const ch = clickhouse();
        const result = await ch.query({
          format: "JSON",
          query,
          query_params: params,
        });
        const json = await result.json<z.infer<typeof spatialSceneRow>>();
        const rows = z.array(spatialSceneRow).parse(json.data);
        return spatialScenesOutput.parse({
          scenes: rows.map((r) => ({
            bounds: {
              maxX: r.maxX,
              maxY: r.maxY,
              maxZ: r.maxZ,
              minX: r.minX,
              minY: r.minY,
              minZ: r.minZ,
            },
            eventCount: r.eventCount,
            scene: r.scene,
          })),
        });
      }),
    voxels: protectedProcedure
      .input(spatialVoxelsInput)
      .handler(async ({ context, input }) => {
        await assertProjectAccess(input.projectId, context.session.user.id);
        const { query, params } = buildVoxelsQuery(input);
        const ch = clickhouse();
        const result = await ch.query({
          format: "JSON",
          query,
          query_params: params,
        });
        const json = await result.json<z.infer<typeof voxelRow>>();
        const rows = z.array(voxelRow).parse(json.data);
        const truncated = rows.length > input.limit;
        const voxels = rows.slice(0, input.limit).map((r) => ({
          count: r.count,
          value: r.value,
          x: voxelCenter(r.gx, input.voxelSize),
          y: voxelCenter(r.gy, input.voxelSize),
          z: voxelCenter(r.gz, input.voxelSize),
        }));
        return spatialVoxelsOutput.parse({
          truncated,
          voxelSize: input.voxelSize,
          voxels,
        });
      }),
  },
};
