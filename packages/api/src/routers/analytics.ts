import { z } from "zod";

import { assertProjectAccess } from "../access";
import { clickhouse } from "../clickhouse";
import { protectedProcedure } from "../index";
import { buildBreakdownQuery } from "../queries/breakdown";
import { buildDailyQuery } from "../queries/daily";
import {
  buildMapsBreakdownQuery,
  buildMapsOverTimeQuery,
  buildMapsTableCountQuery,
  buildMapsTableQuery,
} from "../queries/maps";
import {
  buildPlayersDailyQuery,
  buildPlayersTotalsQuery,
} from "../queries/players";
import { buildRecentCountQuery, buildRecentRowsQuery } from "../queries/recent";
import {
  buildSessionsHeatmapQuery,
  buildSessionsHistogramQuery,
  buildSessionsTrendQuery,
} from "../queries/sessions";
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
});

// Paginated session history for one player — split from playerProfile so table
// paging/sorting/filtering never refetches the profile's aggregate queries.
const playerSessionsInput = z.object({
  filters: z.array(filterSchema).max(10).optional(),
  joinOperator: z.enum(["and", "or"]).default("and"),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(10),
  playerId: z.string().min(1),
  projectId: z.string().min(1),
  sortBy: z.enum(["started_at", "duration_seconds", "event_count"]).optional(),
  sortDesc: z.boolean().default(true),
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
  avg_session_seconds: z.coerce.number(),
  first_seen: z.string(),
  last_seen: z.string(),
  longest_session_seconds: z.coerce.number(),
  median_session_seconds: z.coerce.number(),
  total_events: z.coerce.number(),
  total_playtime_seconds: z.coerce.number(),
  total_sessions: z.coerce.number(),
});

// One calendar day of player activity — feeds the profile activity calendar.
const playerActivityRow = z.object({
  day: z.string(),
  events: z.coerce.number(),
  sessions: z.coerce.number(),
});

// Event density per weekday × hour — feeds the "when they play" heatmap.
const playerHourGridRow = z.object({
  events: z.coerce.number(),
  hour: z.coerce.number(),
  weekday: z.coerce.number(),
});

const playerEventBreakdownRow = z.object({
  count: z.coerce.number(),
  event_type: z.string(),
});

// Per-map session counts and playtime, map taken from each session's first event.
const playerMapRow = z.object({
  map: z.string(),
  playtime_seconds: z.coerce.number(),
  sessions: z.coerce.number(),
});

// Latest hardware/client specs reported on a session_start event. All-empty
// rows (player never sent specs) are collapsed to null by the handler.
const playerSpecsRow = z.object({
  captured_at: z.string(),
  cpu: z.string(),
  gpu: z.string(),
  os: z.string(),
  platform: z.string(),
  ram_gb: z.coerce.number(),
  resolution: z.string(),
  version: z.string(),
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

// Per-player retention: cohort = first-seen day; retained_dN is 1 when the
// player had any activity exactly N days after their cohort day. Mirrors the
// day-offset logic of the global `retention` procedure, scoped to one player.
const playerRetentionRow = z.object({
  cohort_date: z.string(),
  retained_d1: z.coerce.number(),
  retained_d30: z.coerce.number(),
  retained_d7: z.coerce.number(),
});

const playerProfileOutput = z.object({
  activity: z.array(playerActivityRow),
  durationHistogram: z.array(sessionsHistogramRow),
  eventBreakdown: z.array(playerEventBreakdownRow),
  hourGrid: z.array(playerHourGridRow),
  lifetime: playerLifetimeRow,
  maps: z.array(playerMapRow),
  retention: playerRetentionRow,
  specs: playerSpecsRow.nullable(),
  timeline: z.array(playerTimelineRow),
});

const playerSessionsOutput = z.object({
  rows: z.array(playerSessionRow),
  total: z.coerce.number(),
});

const playersListInput = z.object({
  filters: z.array(filterSchema).max(10).optional(),
  from: z.iso.datetime(),
  joinOperator: z.enum(["and", "or"]).default("and"),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(10),
  projectId: z.string().min(1),
  sortBy: z.string().optional(),
  sortDesc: z.boolean().default(true),
  to: z.iso.datetime(),
});

// Browsable-player list filters — all aggregate aliases (player_id is the
// GROUP BY key), applied via HAVING and mirrored into the count subquery.
const PLAYERS_LIST_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  events: { expr: "events", type: "number" },
  first_seen: { expr: "first_seen", type: "string" },
  last_seen: { expr: "last_seen", type: "string" },
  player_id: { expr: "player_id", type: "string" },
  sessions: { expr: "sessions", type: "number" },
};

const playersListRow = z.object({
  events: z.coerce.number(),
  first_seen: z.string(),
  last_seen: z.string(),
  player_id: z.string(),
  sessions: z.coerce.number(),
});

const playersListOutput = z.object({
  rows: z.array(playersListRow),
  total: z.coerce.number(),
});

const sessionsListInput = z.object({
  filters: z.array(filterSchema).max(10).optional(),
  from: z.iso.datetime(),
  joinOperator: z.enum(["and", "or"]).default("and"),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(10),
  projectId: z.string().min(1),
  sortBy: z.string().optional(),
  sortDesc: z.boolean().default(true),
  to: z.iso.datetime(),
});

// Browsable-session list filters — session_id is the GROUP BY key; the rest are
// per-session aggregate aliases. All applied via HAVING.
const SESSIONS_LIST_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  duration_seconds: { expr: "duration_seconds", type: "number" },
  event_count: { expr: "event_count", type: "number" },
  map: { expr: "map", type: "string" },
  player_id: { expr: "player_id", type: "string" },
  session_id: { expr: "session_id", type: "string" },
  started_at: { expr: "started_at", type: "string" },
};

const sessionsListRow = z.object({
  duration_seconds: z.coerce.number(),
  ended_at: z.string(),
  event_count: z.coerce.number(),
  map: z.string(),
  player_id: z.string(),
  session_id: z.string(),
  started_at: z.string(),
});

const sessionsListOutput = z.object({
  rows: z.array(sessionsListRow),
  total: z.coerce.number(),
});

const sessionProfileInput = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
});

// Paginated event log for one session — split from sessionProfile so table
// paging/sorting/filtering never refetches the profile's aggregate queries.
const sessionEventsInput = z.object({
  filters: z.array(filterSchema).max(10).optional(),
  joinOperator: z.enum(["and", "or"]).default("and"),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(20),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  sortBy: z.string().optional(),
  sortDesc: z.boolean().default(false),
});

const sessionMetaRow = z.object({
  duration_seconds: z.coerce.number(),
  ended_at: z.string(),
  event_count: z.coerce.number(),
  map: z.string(),
  player_id: z.string(),
  session_id: z.string(),
  started_at: z.string(),
});

const sessionEventRow = z.object({
  event_type: z.string(),
  properties: z.string(),
  timestamp: z.string(),
});

// In-session performance digest: FPS from fps_sample events, load time from
// load_complete, deaths/crashes from their respective event types.
const sessionPerfRow = z.object({
  avg_fps: z.coerce.number(),
  crash_reason: z.string(),
  crashes: z.coerce.number(),
  deaths: z.coerce.number(),
  load_ms: z.coerce.number(),
  max_fps: z.coerce.number(),
  min_fps: z.coerce.number(),
});

const sessionFpsPointRow = z.object({
  fps: z.coerce.number(),
  offset_seconds: z.coerce.number(),
});

const sessionProfileOutput = z.object({
  eventBreakdown: z.array(playerEventBreakdownRow),
  fpsSeries: z.array(sessionFpsPointRow),
  meta: sessionMetaRow,
  perf: sessionPerfRow,
  specs: playerSpecsRow.nullable(),
});

const sessionEventsOutput = z.object({
  rows: z.array(sessionEventRow),
  total: z.coerce.number(),
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

      const { query, params } = buildDailyQuery(input);
      const result = await clickhouse().query({
        format: "JSON",
        query,
        query_params: params,
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

      const dailyQuery = buildPlayersDailyQuery(input);
      const totalsQuery = buildPlayersTotalsQuery(input);
      const [dailyResult, totalsResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: dailyQuery.query,
          query_params: dailyQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: totalsQuery.query,
          query_params: totalsQuery.params,
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

      const histogramQuery = buildSessionsHistogramQuery(input);
      const trendQuery = buildSessionsTrendQuery(input);
      const heatmapQuery = buildSessionsHeatmapQuery(input);
      const [histogramResult, trendResult, heatmapResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: histogramQuery.query,
          query_params: histogramQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: trendQuery.query,
          query_params: trendQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: heatmapQuery.query,
          query_params: heatmapQuery.params,
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

      const breakdownQuery = buildMapsBreakdownQuery(input);
      const overTimeQuery = buildMapsOverTimeQuery(input);
      const tableQuery = buildMapsTableQuery(input);
      const tableCountQuery = buildMapsTableCountQuery(input);

      const [breakdownResult, overTimeResult, tableResult, tableCountResult] =
        await Promise.all([
          ch.query({
            format: "JSON",
            query: breakdownQuery.query,
            query_params: breakdownQuery.params,
          }),
          ch.query({
            format: "JSON",
            query: overTimeQuery.query,
            query_params: overTimeQuery.params,
          }),
          ch.query({
            format: "JSON",
            query: tableQuery.query,
            query_params: tableQuery.params,
          }),
          ch.query({
            format: "JSON",
            query: tableCountQuery.query,
            query_params: tableCountQuery.params,
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

      const { query, params } = buildBreakdownQuery(input);
      const result = await clickhouse().query({
        format: "JSON",
        query,
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

      const rowsQuery = buildRecentRowsQuery(input);
      const countQuery = buildRecentCountQuery(input);
      const ch = clickhouse();

      const [result, countResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: rowsQuery.query,
          query_params: rowsQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: countQuery.query,
          query_params: countQuery.params,
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

      // Per-session durations for one player — shared by the lifetime stats,
      // map distribution, and duration histogram queries.
      const playerSessionsCte = `
          WITH player_sessions AS (
            SELECT
              argMin(JSONExtractString(properties, 'map'), timestamp) AS map,
              dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds
            FROM analytics.events
            WHERE project_id = {projectId:String}
              AND player_id = {playerId:String}
            GROUP BY session_id
          )`;

      const [
        lifetimeResult,
        activityResult,
        hourGridResult,
        breakdownResult,
        mapsResult,
        histogramResult,
        specsResult,
        timelineResult,
        retentionResult,
      ] = await Promise.all([
        ch.query({
          format: "JSON",
          query: `${playerSessionsCte}
              SELECT
                toString(min(timestamp)) AS first_seen,
                toString(max(timestamp)) AS last_seen,
                count() AS total_events,
                uniq(session_id) AS total_sessions,
                uniq(toDate(timestamp)) AS active_days,
                (SELECT toUInt64(round(ifNotFinite(avg(duration_seconds), 0))) FROM player_sessions) AS avg_session_seconds,
                (SELECT toUInt64(round(ifNotFinite(quantile(0.5)(duration_seconds), 0))) FROM player_sessions) AS median_session_seconds,
                (SELECT toUInt64(max(duration_seconds)) FROM player_sessions) AS longest_session_seconds,
                (SELECT toUInt64(sum(duration_seconds)) FROM player_sessions) AS total_playtime_seconds
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND player_id = {playerId:String}
            `,
          query_params: input,
        }),
        // Last 12 weeks of daily activity — the profile's calendar window.
        ch.query({
          format: "JSON",
          query: `
              SELECT
                toString(toDate(timestamp)) AS day,
                toUInt64(count()) AS events,
                toUInt64(uniq(session_id)) AS sessions
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND player_id = {playerId:String}
                AND timestamp >= now() - INTERVAL 84 DAY
              GROUP BY day
              ORDER BY day
            `,
          query_params: input,
        }),
        ch.query({
          format: "JSON",
          query: `
              SELECT
                toUInt8(toDayOfWeek(timestamp)) AS weekday,
                toUInt8(toHour(timestamp))      AS hour,
                toUInt64(count())               AS events
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND player_id = {playerId:String}
              GROUP BY weekday, hour
              ORDER BY weekday, hour
            `,
          query_params: input,
        }),
        ch.query({
          format: "JSON",
          query: `
              SELECT
                event_type,
                toUInt64(count()) AS count
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND player_id = {playerId:String}
              GROUP BY event_type
              ORDER BY count DESC
            `,
          query_params: input,
        }),
        ch.query({
          format: "JSON",
          query: `${playerSessionsCte}
              SELECT
                map,
                toUInt64(count()) AS sessions,
                toUInt64(sum(duration_seconds)) AS playtime_seconds
              FROM player_sessions
              GROUP BY map
              ORDER BY sessions DESC, map ASC
            `,
          query_params: input,
        }),
        // Same buckets as the project-wide sessions histogram.
        ch.query({
          format: "JSON",
          query: `${playerSessionsCte}
              SELECT
                multiIf(duration_seconds < 60, '0-1m',
                        duration_seconds < 300, '1-5m',
                        duration_seconds < 900, '5-15m',
                        duration_seconds < 1800, '15-30m', '30m+') AS bucket,
                multiIf(duration_seconds < 60, 0,
                        duration_seconds < 300, 1,
                        duration_seconds < 900, 2,
                        duration_seconds < 1800, 3, 4)             AS sort,
                toUInt64(count())                                   AS sessions
              FROM player_sessions
              GROUP BY bucket, sort
              ORDER BY sort
            `,
          query_params: input,
        }),
        ch.query({
          format: "JSON",
          query: `
              SELECT
                argMax(JSONExtractString(properties, 'platform'), timestamp)   AS platform,
                argMax(JSONExtractString(properties, 'version'), timestamp)    AS version,
                argMax(JSONExtractString(properties, 'os'), timestamp)         AS os,
                argMax(JSONExtractString(properties, 'gpu'), timestamp)        AS gpu,
                argMax(JSONExtractString(properties, 'cpu'), timestamp)        AS cpu,
                argMax(JSONExtractUInt(properties, 'ram_gb'), timestamp)       AS ram_gb,
                argMax(JSONExtractString(properties, 'resolution'), timestamp) AS resolution,
                toString(max(timestamp)) AS captured_at
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND player_id = {playerId:String}
                AND event_type = 'session_start'
            `,
          query_params: input,
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
        ch.query({
          format: "JSON",
          query: `
              WITH (
                SELECT min(toDate(timestamp))
                FROM analytics.events
                WHERE project_id = {projectId:String}
                  AND player_id = {playerId:String}
              ) AS cohort
              SELECT
                toString(cohort) AS cohort_date,
                countIf(toDate(timestamp) = cohort + 1) > 0 AS retained_d1,
                countIf(toDate(timestamp) = cohort + 7) > 0 AS retained_d7,
                countIf(toDate(timestamp) = cohort + 30) > 0 AS retained_d30
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND player_id = {playerId:String}
            `,
          query_params: input,
        }),
      ]);

      const [
        lifetimeJson,
        activityJson,
        hourGridJson,
        breakdownJson,
        mapsJson,
        histogramJson,
        specsJson,
        timelineJson,
        retentionJson,
      ] = await Promise.all([
        lifetimeResult.json<z.infer<typeof playerLifetimeRow>>(),
        activityResult.json<z.infer<typeof playerActivityRow>>(),
        hourGridResult.json<z.infer<typeof playerHourGridRow>>(),
        breakdownResult.json<z.infer<typeof playerEventBreakdownRow>>(),
        mapsResult.json<z.infer<typeof playerMapRow>>(),
        histogramResult.json<z.infer<typeof sessionsHistogramRow>>(),
        specsResult.json<z.infer<typeof playerSpecsRow>>(),
        timelineResult.json<z.infer<typeof playerTimelineRow>>(),
        retentionResult.json<z.infer<typeof playerRetentionRow>>(),
      ]);

      // A player with no session_start (or one that never reported hardware)
      // yields an all-empty aggregate row — collapse it to "no specs".
      const [specsRow] = specsJson.data;
      const hasSpecs = Boolean(
        specsRow && (specsRow.os || specsRow.gpu || specsRow.platform)
      );

      return playerProfileOutput.parse({
        activity: activityJson.data,
        durationHistogram: histogramJson.data,
        eventBreakdown: breakdownJson.data,
        hourGrid: hourGridJson.data,
        lifetime: lifetimeJson.data[0],
        maps: mapsJson.data,
        retention: retentionJson.data[0],
        specs: hasSpecs ? specsRow : null,
        timeline: timelineJson.data,
      });
    }),

  // Paginated, filterable session history for one player — kept separate from
  // playerProfile so table interactions don't refetch the aggregate queries.
  playerSessions: protectedProcedure
    .input(playerSessionsInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const ch = clickhouse();

      const sortColumn = input.sortBy ?? "started_at";
      const sortDir = input.sortDesc ? "DESC" : "ASC";
      const offset = (input.page - 1) * input.perPage;

      // Filters target per-session aggregate aliases, so they go in HAVING —
      // applied to both the page query and the count subquery so pagination
      // reflects the filtered total.
      const params: Record<string, unknown> = {
        offset,
        perPage: input.perPage,
        playerId: input.playerId,
        projectId: input.projectId,
      };
      const filterCondition = buildColumnFilters(
        input.filters,
        PLAYER_SESSION_FILTER_COLUMNS,
        params,
        input.joinOperator
      );
      const havingClause = filterCondition ? `HAVING ${filterCondition}` : "";

      const [sessionsResult, countResult] = await Promise.all([
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
              ${havingClause}
              ORDER BY ${sortColumn} ${sortDir}
              LIMIT {perPage:Int32}
              OFFSET {offset:Int32}
            `,
          query_params: params,
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
                ${havingClause}
              )
            `,
          query_params: params,
        }),
      ]);

      const [sessionsJson, countJson] = await Promise.all([
        sessionsResult.json<z.infer<typeof playerSessionRow>>(),
        countResult.json<{ total: number }>(),
      ]);

      return playerSessionsOutput.parse({
        rows: sessionsJson.data,
        total: countJson.data[0]?.total ?? 0,
      });
    }),

  // Browsable, paginated list of players active in the range — powers the
  // clickable players table on the Engagement → Players page.
  playersList: protectedProcedure
    .input(playersListInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const SAFE_SORT_COLUMNS: Record<string, string> = {
        events: "events",
        first_seen: "first_seen",
        last_seen: "last_seen",
        sessions: "sessions",
      };
      const sortCol = input.sortBy
        ? (SAFE_SORT_COLUMNS[input.sortBy] ?? "last_seen")
        : "last_seen";
      const sortDir = input.sortDesc ? "DESC" : "ASC";
      const offset = (input.page - 1) * input.perPage;

      const params: Record<string, unknown> = {
        from: input.from.replace(/Z$/u, ""),
        offset,
        perPage: input.perPage,
        projectId: input.projectId,
        to: input.to.replace(/Z$/u, ""),
      };
      const havingCondition = buildColumnFilters(
        input.filters,
        PLAYERS_LIST_FILTER_COLUMNS,
        params,
        input.joinOperator
      );
      const havingClause = havingCondition ? `HAVING ${havingCondition}` : "";

      // Anonymous activity (empty player_id) groups into a single non-clickable
      // row, so exclude it from the browsable list.
      const playerSelect = `
        SELECT
          player_id,
          toString(min(timestamp)) AS first_seen,
          toString(max(timestamp)) AS last_seen,
          uniq(session_id) AS sessions,
          count() AS events
        FROM analytics.events
        WHERE project_id = {projectId:String}
          AND player_id != ''
          AND timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}
        GROUP BY player_id
        ${havingClause}
      `;

      const ch = clickhouse();
      const [result, countResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: `
            ${playerSelect}
            ORDER BY ${sortCol} ${sortDir}
            LIMIT {perPage:UInt32} OFFSET {offset:UInt32}
          `,
          query_params: params,
        }),
        ch.query({
          format: "JSON",
          query: `SELECT count() AS total FROM (${playerSelect})`,
          query_params: params,
        }),
      ]);

      const json = await result.json<z.infer<typeof playersListRow>>();
      const countJson = await countResult.json<{ total: string }>();

      return playersListOutput.parse({
        rows: json.data,
        total: Number(countJson.data[0]?.total ?? 0),
      });
    }),

  // Browsable, paginated list of sessions in the range — powers the clickable
  // sessions table on the Engagement → Sessions page.
  sessionsList: protectedProcedure
    .input(sessionsListInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const SAFE_SORT_COLUMNS: Record<string, string> = {
        duration_seconds: "duration_seconds",
        event_count: "event_count",
        started_at: "started_at",
      };
      const sortCol = input.sortBy
        ? (SAFE_SORT_COLUMNS[input.sortBy] ?? "started_at")
        : "started_at";
      const sortDir = input.sortDesc ? "DESC" : "ASC";
      const offset = (input.page - 1) * input.perPage;

      const params: Record<string, unknown> = {
        from: input.from.replace(/Z$/u, ""),
        offset,
        perPage: input.perPage,
        projectId: input.projectId,
        to: input.to.replace(/Z$/u, ""),
      };
      const havingCondition = buildColumnFilters(
        input.filters,
        SESSIONS_LIST_FILTER_COLUMNS,
        params,
        input.joinOperator
      );
      const havingClause = havingCondition ? `HAVING ${havingCondition}` : "";

      const sessionSelect = `
        SELECT
          session_id,
          argMin(player_id, timestamp) AS player_id,
          toString(min(timestamp)) AS started_at,
          toString(max(timestamp)) AS ended_at,
          dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds,
          count() AS event_count,
          argMin(JSONExtractString(properties, 'map'), timestamp) AS map
        FROM analytics.events
        WHERE project_id = {projectId:String}
          AND timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}
        GROUP BY session_id
        ${havingClause}
      `;

      const ch = clickhouse();
      const [result, countResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: `
            ${sessionSelect}
            ORDER BY ${sortCol} ${sortDir}
            LIMIT {perPage:UInt32} OFFSET {offset:UInt32}
          `,
          query_params: params,
        }),
        ch.query({
          format: "JSON",
          query: `SELECT count() AS total FROM (${sessionSelect})`,
          query_params: params,
        }),
      ]);

      const json = await result.json<z.infer<typeof sessionsListRow>>();
      const countJson = await countResult.json<{ total: string }>();

      return sessionsListOutput.parse({
        rows: json.data,
        total: Number(countJson.data[0]?.total ?? 0),
      });
    }),

  // Single-session detail: meta header + the session's paginated event stream.
  sessionProfile: protectedProcedure
    .input(sessionProfileInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const ch = clickhouse();
      const [metaResult, perfResult, fpsResult, breakdownResult, specsResult] =
        await Promise.all([
          ch.query({
            format: "JSON",
            query: `
            SELECT
              argMin(player_id, timestamp) AS player_id,
              toString(min(timestamp)) AS started_at,
              toString(max(timestamp)) AS ended_at,
              dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds,
              count() AS event_count,
              argMin(JSONExtractString(properties, 'map'), timestamp) AS map
            FROM analytics.events
            WHERE project_id = {projectId:String}
              AND session_id = {sessionId:String}
          `,
            query_params: input,
          }),
          ch.query({
            format: "JSON",
            query: `
            SELECT
              toUInt64(round(ifNotFinite(avgIf(JSONExtractFloat(properties, 'fps'), event_type = 'fps_sample'), 0))) AS avg_fps,
              toUInt64(round(ifNotFinite(minIf(JSONExtractFloat(properties, 'fps'), event_type = 'fps_sample'), 0))) AS min_fps,
              toUInt64(round(ifNotFinite(maxIf(JSONExtractFloat(properties, 'fps'), event_type = 'fps_sample'), 0))) AS max_fps,
              toUInt64(countIf(event_type = 'player_death')) AS deaths,
              toUInt64(countIf(event_type = 'crash')) AS crashes,
              anyIf(JSONExtractString(properties, 'reason'), event_type = 'crash') AS crash_reason,
              toUInt64(round(ifNotFinite(avgIf(JSONExtractFloat(properties, 'ms'), event_type = 'load_complete'), 0))) AS load_ms
            FROM analytics.events
            WHERE project_id = {projectId:String}
              AND session_id = {sessionId:String}
          `,
            query_params: input,
          }),
          // FPS samples positioned by seconds since session start.
          ch.query({
            format: "JSON",
            query: `
            WITH (
              SELECT min(timestamp) FROM analytics.events
              WHERE project_id = {projectId:String}
                AND session_id = {sessionId:String}
            ) AS session_start
            SELECT
              toUInt32(dateDiff('second', session_start, timestamp)) AS offset_seconds,
              toUInt32(round(JSONExtractFloat(properties, 'fps'))) AS fps
            FROM analytics.events
            WHERE project_id = {projectId:String}
              AND session_id = {sessionId:String}
              AND event_type = 'fps_sample'
            ORDER BY offset_seconds
          `,
            query_params: input,
          }),
          ch.query({
            format: "JSON",
            query: `
            SELECT
              event_type,
              toUInt64(count()) AS count
            FROM analytics.events
            WHERE project_id = {projectId:String}
              AND session_id = {sessionId:String}
            GROUP BY event_type
            ORDER BY count DESC
          `,
            query_params: input,
          }),
          // Hardware/client specs reported on this session's session_start.
          ch.query({
            format: "JSON",
            query: `
            SELECT
              argMin(JSONExtractString(properties, 'platform'), timestamp)   AS platform,
              argMin(JSONExtractString(properties, 'version'), timestamp)    AS version,
              argMin(JSONExtractString(properties, 'os'), timestamp)         AS os,
              argMin(JSONExtractString(properties, 'gpu'), timestamp)        AS gpu,
              argMin(JSONExtractString(properties, 'cpu'), timestamp)        AS cpu,
              argMin(JSONExtractUInt(properties, 'ram_gb'), timestamp)       AS ram_gb,
              argMin(JSONExtractString(properties, 'resolution'), timestamp) AS resolution,
              toString(min(timestamp)) AS captured_at
            FROM analytics.events
            WHERE project_id = {projectId:String}
              AND session_id = {sessionId:String}
              AND event_type = 'session_start'
          `,
            query_params: input,
          }),
        ]);

      const [metaJson, perfJson, fpsJson, breakdownJson, specsJson] =
        await Promise.all([
          metaResult.json<Omit<z.infer<typeof sessionMetaRow>, "session_id">>(),
          perfResult.json<z.infer<typeof sessionPerfRow>>(),
          fpsResult.json<z.infer<typeof sessionFpsPointRow>>(),
          breakdownResult.json<z.infer<typeof playerEventBreakdownRow>>(),
          specsResult.json<z.infer<typeof playerSpecsRow>>(),
        ]);

      // A session with no session_start (or one that never reported hardware)
      // yields an all-empty aggregate row — collapse it to "no specs".
      const [specsRow] = specsJson.data;
      const hasSpecs = Boolean(
        specsRow && (specsRow.os || specsRow.gpu || specsRow.platform)
      );

      return sessionProfileOutput.parse({
        eventBreakdown: breakdownJson.data,
        fpsSeries: fpsJson.data,
        meta: { ...metaJson.data[0], session_id: input.sessionId },
        perf: perfJson.data[0],
        specs: hasSpecs ? specsRow : null,
      });
    }),

  // Paginated, filterable event log for one session — kept separate from
  // sessionProfile so table interactions don't refetch the aggregate queries.
  sessionEvents: protectedProcedure
    .input(sessionEventsInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const SAFE_SORT_COLUMNS = new Set(["timestamp", "event_type"]);
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
        sessionId: input.sessionId,
      };
      const conditions = [
        "project_id = {projectId:String}",
        "session_id = {sessionId:String}",
      ];
      for (const condition of applyFilters(input.filters, params)) {
        conditions.push(condition);
      }
      const where = conditions.join(" AND ");

      const ch = clickhouse();
      const [eventsResult, countResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: `
            SELECT
              event_type,
              toString(timestamp) AS timestamp,
              properties
            FROM analytics.events
            WHERE ${where}
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
            WHERE ${where}
          `,
          query_params: params,
        }),
      ]);

      const [eventsJson, countJson] = await Promise.all([
        eventsResult.json<z.infer<typeof sessionEventRow>>(),
        countResult.json<{ total: number }>(),
      ]);

      return sessionEventsOutput.parse({
        rows: eventsJson.data,
        total: countJson.data[0]?.total ?? 0,
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
