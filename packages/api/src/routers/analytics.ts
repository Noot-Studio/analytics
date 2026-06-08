import { z } from "zod";

import { assertProjectAccess } from "../access";
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
import { paginated, runQueries, runQuery } from "../run-query";
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

const recentRow = z.object({
  event_type: z.string(),
  player_id: z.string(),
  properties: z.string(),
  session_id: z.string(),
  timestamp: z.string(),
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

      return runQuery(context.ch, buildDailyQuery(input), dailyRow);
    }),

  // DAU + new-vs-returning daily series, plus trailing WAU/MAU.
  players: protectedProcedure
    .input(playersInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const { daily, totals } = await runQueries(context.ch, {
        daily: {
          query: buildPlayersDailyQuery(input),
          schema: playersDailyRow,
        },
        totals: {
          query: buildPlayersTotalsQuery(input),
          schema: playersTotalsRow,
        },
      });

      const totalsRow = totals[0] ?? { mau: 0, wau: 0 };

      return playersOutput.parse({
        daily,
        mau: totalsRow.mau,
        wau: totalsRow.wau,
      });
    }),

  // Session duration histogram, avg-duration trend, and time-of-day heatmap.
  sessions: protectedProcedure
    .input(sessionsInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const { heatmap, histogram, trend } = await runQueries(context.ch, {
        heatmap: {
          query: buildSessionsHeatmapQuery(input),
          schema: sessionsHeatmapRow,
        },
        histogram: {
          query: buildSessionsHistogramQuery(input),
          schema: sessionsHistogramRow,
        },
        trend: {
          query: buildSessionsTrendQuery(input),
          schema: sessionsTrendRow,
        },
      });

      return sessionsOutput.parse({ heatmap, histogram, trend });
    }),

  // Per-map/mode breakdown derived from session_start events.
  maps: protectedProcedure
    .input(mapsInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const [charts, table] = await Promise.all([
        runQueries(context.ch, {
          breakdown: {
            query: buildMapsBreakdownQuery(input),
            schema: mapsBreakdownRow,
          },
          overTime: {
            query: buildMapsOverTimeQuery(input),
            schema: mapsOverTimeRow,
          },
        }),
        paginated(
          context.ch,
          buildMapsTableQuery(input),
          buildMapsTableCountQuery(input),
          mapsBreakdownRow
        ),
      ]);

      return mapsOutput.parse({
        breakdown: charts.breakdown,
        overTime: charts.overTime,
        table,
      });
    }),

  // Cohort retention: day-1/7/30 per first-seen cohort plus a maturity-gated
  // average retention curve. Cohort date comes from player_first_seen; return
  // activity comes from raw events.
  retention: protectedProcedure
    .input(retentionInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const [curve, table] = await Promise.all([
        runQuery(
          context.ch,
          buildRetentionCurveQuery(input),
          retentionCurveRow
        ),
        paginated(
          context.ch,
          buildRetentionTableQuery(input),
          buildRetentionTableCountQuery(input),
          retentionCohortRow
        ),
      ]);

      return retentionOutput.parse({ curve, table });
    }),

  // Ad-hoc funnel over user-defined ordered event steps. windowFunnel returns
  // the furthest consecutive step each player reached; per-step counts and a
  // first-touch conversion trend are derived from that.
  funnels: protectedProcedure
    .input(funnelsInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const { levelCounts, trend } = await runQueries(context.ch, {
        levelCounts: {
          query: buildFunnelsLevelsQuery(input),
          schema: funnelsLevelRow,
        },
        trend: {
          query: buildFunnelsTrendQuery(input),
          schema: funnelsTrendRow,
        },
      });

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

      return runQuery(context.ch, buildBreakdownQuery(input), eventsRow);
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

      const { rows, total } = await paginated(
        context.ch,
        buildRecentRowsQuery(input),
        buildRecentCountQuery(input),
        recentRow
      );

      return { rows, total };
    }),

  performance: protectedProcedure
    .input(performanceInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const { byMap, crashes, fps, loadHistogram } = await runQueries(
        context.ch,
        {
          byMap: {
            query: buildPerformanceByMapQuery(input),
            schema: performanceMapRow,
          },
          crashes: {
            query: buildPerformanceCrashQuery(input),
            schema: performanceCrashRow,
          },
          fps: {
            query: buildPerformanceFpsQuery(input),
            schema: performanceFpsRow,
          },
          loadHistogram: {
            query: buildPerformanceLoadQuery(input),
            schema: performanceLoadBucketRow,
          },
        }
      );

      return performanceOutput.parse({ byMap, crashes, fps, loadHistogram });
    }),

  playerProfile: protectedProcedure
    .input(playerProfileInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const {
        activity,
        durationHistogram,
        eventBreakdown,
        hourGrid,
        lifetime,
        maps,
        retention,
        specs,
        timeline,
      } = await runQueries(context.ch, {
        activity: {
          query: buildPlayerActivityQuery(input),
          schema: playerActivityRow,
        },
        durationHistogram: {
          query: buildPlayerHistogramQuery(input),
          schema: sessionsHistogramRow,
        },
        eventBreakdown: {
          query: buildPlayerEventBreakdownQuery(input),
          schema: playerEventBreakdownRow,
        },
        hourGrid: {
          query: buildPlayerHourGridQuery(input),
          schema: playerHourGridRow,
        },
        lifetime: {
          query: buildPlayerLifetimeQuery(input),
          schema: playerLifetimeRow,
        },
        maps: { query: buildPlayerMapsQuery(input), schema: playerMapRow },
        retention: {
          query: buildPlayerRetentionQuery(input),
          schema: playerRetentionRow,
        },
        specs: {
          query: buildPlayerSpecsQuery(input),
          schema: playerSpecsRow,
        },
        timeline: {
          query: buildPlayerTimelineQuery(input),
          schema: playerTimelineRow,
        },
      });

      // A player with no session_start (or one that never reported hardware)
      // yields an all-empty aggregate row — collapse it to "no specs".
      const [specsRow] = specs;
      const hasSpecs = Boolean(
        specsRow && (specsRow.os || specsRow.gpu || specsRow.platform)
      );

      return playerProfileOutput.parse({
        activity,
        durationHistogram,
        eventBreakdown,
        hourGrid,
        lifetime: lifetime[0],
        maps,
        retention: retention[0],
        specs: hasSpecs ? specsRow : null,
        timeline,
      });
    }),

  // Paginated, filterable session history for one player — kept separate from
  // playerProfile so table interactions don't refetch the aggregate queries.
  playerSessions: protectedProcedure
    .input(playerSessionsInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const { rows, total } = await paginated(
        context.ch,
        buildPlayerSessionsQuery(input),
        buildPlayerSessionsCountQuery(input),
        playerSessionRow
      );

      return playerSessionsOutput.parse({ rows, total });
    }),

  // Browsable, paginated list of players active in the range — powers the
  // clickable players table on the Engagement → Players page.
  playersList: protectedProcedure
    .input(playersListInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const { rows, total } = await paginated(
        context.ch,
        buildPlayersListQuery(input),
        buildPlayersListCountQuery(input),
        playersListRow
      );

      return playersListOutput.parse({ rows, total });
    }),

  // Browsable, paginated list of sessions in the range — powers the clickable
  // sessions table on the Engagement → Sessions page.
  sessionsList: protectedProcedure
    .input(sessionsListInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const { rows, total } = await paginated(
        context.ch,
        buildSessionsListQuery(input),
        buildSessionsListCountQuery(input),
        sessionsListRow
      );

      return sessionsListOutput.parse({ rows, total });
    }),

  // Single-session detail: meta header + the session's paginated event stream.
  sessionProfile: protectedProcedure
    .input(sessionProfileInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const { eventBreakdown, fpsSeries, meta, perf, specs } = await runQueries(
        context.ch,
        {
          eventBreakdown: {
            query: buildSessionBreakdownQuery(input),
            schema: playerEventBreakdownRow,
          },
          fpsSeries: {
            query: buildSessionFpsQuery(input),
            schema: sessionFpsPointRow,
          },
          meta: {
            query: buildSessionMetaQuery(input),
            schema: sessionMetaRow.omit({ session_id: true }),
          },
          perf: {
            query: buildSessionPerfQuery(input),
            schema: sessionPerfRow,
          },
          specs: {
            query: buildSessionSpecsQuery(input),
            schema: playerSpecsRow,
          },
        }
      );

      // A session with no session_start (or one that never reported hardware)
      // yields an all-empty aggregate row — collapse it to "no specs".
      const [specsRow] = specs;
      const hasSpecs = Boolean(
        specsRow && (specsRow.os || specsRow.gpu || specsRow.platform)
      );

      return sessionProfileOutput.parse({
        eventBreakdown,
        fpsSeries,
        meta: { ...meta[0], session_id: input.sessionId },
        perf: perf[0],
        specs: hasSpecs ? specsRow : null,
      });
    }),

  // Paginated, filterable event log for one session — kept separate from
  // sessionProfile so table interactions don't refetch the aggregate queries.
  sessionEvents: protectedProcedure
    .input(sessionEventsInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const { rows, total } = await paginated(
        context.ch,
        buildSessionEventsQuery(input),
        buildSessionEventsCountQuery(input),
        sessionEventRow
      );

      return sessionEventsOutput.parse({ rows, total });
    }),
  spatial: {
    scenes: protectedProcedure
      .input(spatialScenesInput)
      .handler(async ({ context, input }) => {
        await assertProjectAccess(input.projectId, context.session.user.id);
        const rows = await runQuery(
          context.ch,
          buildScenesQuery(input),
          spatialSceneRow
        );
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
        const rows = await runQuery(
          context.ch,
          buildVoxelsQuery(input),
          voxelRow
        );
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
