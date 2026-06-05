import { z } from "zod";

import { assertProjectAccess } from "../access";
import { clickhouse } from "../clickhouse";
import { protectedProcedure } from "../index";
import { buildBreakdownQuery } from "../queries/breakdown";
import { buildDailyQuery } from "../queries/daily";
import {
  buildFunnelsLevelsQuery,
  buildFunnelsTrendQuery,
  DEFAULT_FUNNEL_WINDOW_SECONDS,
  MAX_FUNNEL_STEPS,
  MIN_FUNNEL_STEPS,
} from "../queries/funnels";
import {
  buildMapsBreakdownQuery,
  buildMapsOverTimeQuery,
  buildMapsTableCountQuery,
  buildMapsTableQuery,
} from "../queries/maps";
import {
  buildPerformanceByMapQuery,
  buildPerformanceCrashQuery,
  buildPerformanceFpsQuery,
  buildPerformanceLoadQuery,
} from "../queries/performance";
import {
  buildPlayerActivityQuery,
  buildPlayerEventBreakdownQuery,
  buildPlayerHistogramQuery,
  buildPlayerHourGridQuery,
  buildPlayerLifetimeQuery,
  buildPlayerMapsQuery,
  buildPlayerRetentionQuery,
  buildPlayerSpecsQuery,
  buildPlayerTimelineQuery,
} from "../queries/player-profile";
import {
  buildPlayerSessionsCountQuery,
  buildPlayerSessionsQuery,
} from "../queries/player-sessions";
import {
  buildPlayersDailyQuery,
  buildPlayersTotalsQuery,
} from "../queries/players";
import {
  buildPlayersListCountQuery,
  buildPlayersListQuery,
} from "../queries/players-list";
import { buildRecentCountQuery, buildRecentRowsQuery } from "../queries/recent";
import {
  buildRetentionCurveQuery,
  buildRetentionTableCountQuery,
  buildRetentionTableQuery,
} from "../queries/retention";
import {
  buildSessionEventsCountQuery,
  buildSessionEventsQuery,
} from "../queries/session-events";
import {
  buildSessionBreakdownQuery,
  buildSessionFpsQuery,
  buildSessionMetaQuery,
  buildSessionPerfQuery,
  buildSessionSpecsQuery,
} from "../queries/session-profile";
import {
  buildSessionsHeatmapQuery,
  buildSessionsHistogramQuery,
  buildSessionsTrendQuery,
} from "../queries/sessions";
import {
  buildSessionsListCountQuery,
  buildSessionsListQuery,
} from "../queries/sessions-list";
import { filterSchema } from "../query-builder";
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
      const tableQuery = buildRetentionTableQuery(input);
      const countQuery = buildRetentionTableCountQuery(input);
      const curveQuery = buildRetentionCurveQuery(input);

      const [tableResult, tableCountResult, curveResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: tableQuery.query,
          query_params: tableQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: countQuery.query,
          query_params: countQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: curveQuery.query,
          query_params: curveQuery.params,
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
      const levelsQuery = buildFunnelsLevelsQuery(input);
      const trendQuery = buildFunnelsTrendQuery(input);

      const [levelsResult, trendResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: levelsQuery.query,
          query_params: levelsQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: trendQuery.query,
          query_params: trendQuery.params,
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

      const ch = clickhouse();
      const fpsQuery = buildPerformanceFpsQuery(input);
      const crashQuery = buildPerformanceCrashQuery(input);
      const loadQuery = buildPerformanceLoadQuery(input);
      const byMapQuery = buildPerformanceByMapQuery(input);

      const [fpsResult, crashResult, loadResult, byMapResult] =
        await Promise.all([
          ch.query({
            format: "JSON",
            query: fpsQuery.query,
            query_params: fpsQuery.params,
          }),
          ch.query({
            format: "JSON",
            query: crashQuery.query,
            query_params: crashQuery.params,
          }),
          ch.query({
            format: "JSON",
            query: loadQuery.query,
            query_params: loadQuery.params,
          }),
          ch.query({
            format: "JSON",
            query: byMapQuery.query,
            query_params: byMapQuery.params,
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

      const lifetimeQuery = buildPlayerLifetimeQuery(input);
      const activityQuery = buildPlayerActivityQuery(input);
      const hourGridQuery = buildPlayerHourGridQuery(input);
      const breakdownQuery = buildPlayerEventBreakdownQuery(input);
      const mapsQuery = buildPlayerMapsQuery(input);
      const histogramQuery = buildPlayerHistogramQuery(input);
      const specsQuery = buildPlayerSpecsQuery(input);
      const timelineQuery = buildPlayerTimelineQuery(input);
      const retentionQuery = buildPlayerRetentionQuery(input);

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
          query: lifetimeQuery.query,
          query_params: lifetimeQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: activityQuery.query,
          query_params: activityQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: hourGridQuery.query,
          query_params: hourGridQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: breakdownQuery.query,
          query_params: breakdownQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: mapsQuery.query,
          query_params: mapsQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: histogramQuery.query,
          query_params: histogramQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: specsQuery.query,
          query_params: specsQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: timelineQuery.query,
          query_params: timelineQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: retentionQuery.query,
          query_params: retentionQuery.params,
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

      const sessionsQuery = buildPlayerSessionsQuery(input);
      const countQuery = buildPlayerSessionsCountQuery(input);

      const [sessionsResult, countResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: sessionsQuery.query,
          query_params: sessionsQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: countQuery.query,
          query_params: countQuery.params,
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

      const ch = clickhouse();
      const rowsQuery = buildPlayersListQuery(input);
      const countQuery = buildPlayersListCountQuery(input);

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

      const ch = clickhouse();
      const rowsQuery = buildSessionsListQuery(input);
      const countQuery = buildSessionsListCountQuery(input);

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
      const metaQuery = buildSessionMetaQuery(input);
      const perfQuery = buildSessionPerfQuery(input);
      const fpsQuery = buildSessionFpsQuery(input);
      const breakdownQuery = buildSessionBreakdownQuery(input);
      const specsQuery = buildSessionSpecsQuery(input);

      const [metaResult, perfResult, fpsResult, breakdownResult, specsResult] =
        await Promise.all([
          ch.query({
            format: "JSON",
            query: metaQuery.query,
            query_params: metaQuery.params,
          }),
          ch.query({
            format: "JSON",
            query: perfQuery.query,
            query_params: perfQuery.params,
          }),
          ch.query({
            format: "JSON",
            query: fpsQuery.query,
            query_params: fpsQuery.params,
          }),
          ch.query({
            format: "JSON",
            query: breakdownQuery.query,
            query_params: breakdownQuery.params,
          }),
          ch.query({
            format: "JSON",
            query: specsQuery.query,
            query_params: specsQuery.params,
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

      const ch = clickhouse();
      const eventsQuery = buildSessionEventsQuery(input);
      const countQuery = buildSessionEventsCountQuery(input);

      const [eventsResult, countResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: eventsQuery.query,
          query_params: eventsQuery.params,
        }),
        ch.query({
          format: "JSON",
          query: countQuery.query,
          query_params: countQuery.params,
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
