import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import { clickhouse } from "../clickhouse";
import { protectedProcedure } from "../index";

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
  from: z.iso.date(),
  projectId: z.string().min(1),
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
  breakdown: z.array(mapsBreakdownRow),
  overTime: z.array(mapsOverTimeRow),
});

const retentionInput = z.object({
  from: z.iso.date(),
  projectId: z.string().min(1),
  to: z.iso.date(),
});

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
  cohorts: z.array(retentionCohortRow),
  curve: z.array(retentionCurveRow),
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
  timeline: z.array(playerTimelineRow),
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

      const [breakdownResult, overTimeResult] = await Promise.all([
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
      ]);

      const breakdownJson =
        await breakdownResult.json<z.infer<typeof mapsBreakdownRow>>();
      const breakdown = z.array(mapsBreakdownRow).parse(breakdownJson.data);

      const overTimeJson =
        await overTimeResult.json<z.infer<typeof mapsOverTimeRow>>();
      const overTime = z.array(mapsOverTimeRow).parse(overTimeJson.data);

      return mapsOutput.parse({ breakdown, overTime });
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

      const [cohortsResult, curveResult] = await Promise.all([
        ch.query({
          format: "JSON",
          query: `${retentionCte}
            SELECT
              toString(cohort_date)                            AS cohort_date,
              toUInt64(uniqExactIf(player_id, day_offset = 0))  AS size,
              toUInt64(uniqExactIf(player_id, day_offset = 1))  AS d1,
              toUInt64(uniqExactIf(player_id, day_offset = 7))  AS d7,
              toUInt64(uniqExactIf(player_id, day_offset = 30)) AS d30
            FROM joined
            GROUP BY cohort_date
            ORDER BY cohort_date
          `,
          query_params: input,
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

      const cohortsJson =
        await cohortsResult.json<z.infer<typeof retentionCohortRow>>();
      const cohorts = z.array(retentionCohortRow).parse(cohortsJson.data);
      const curveJson =
        await curveResult.json<z.infer<typeof retentionCurveRow>>();
      const curve = z.array(retentionCurveRow).parse(curveJson.data);

      return retentionOutput.parse({ cohorts, curve });
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
    .input(dailyInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

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
          ORDER BY event_count DESC
        `,
        query_params: input,
      });

      const json = await result.json<z.infer<typeof eventsRow>>();
      return z.array(eventsRow).parse(json.data);
    }),

  // Most recent raw events — for the dashboard's live stream view.
  recent: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        projectId: z.string().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const result = await clickhouse().query({
        format: "JSON",
        query: `
          SELECT
            event_type,
            toString(timestamp) AS timestamp,
            session_id,
            player_id,
            properties
          FROM analytics.events
          WHERE project_id = {projectId:String}
          ORDER BY timestamp DESC
          LIMIT {limit:UInt32}
        `,
        query_params: input,
      });

      const json = await result.json<{
        event_type: string;
        timestamp: string;
        session_id: string;
        player_id: string;
        properties: string;
      }>();
      return json.data;
    }),

  performance: protectedProcedure
    .input(performanceInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const ch = clickhouse();
      const [fpsResult, crashResult, loadResult, byMapResult] =
        await Promise.all([
          ch.query({
            format: "JSON",
            query: `
              SELECT
                toDate(timestamp) AS event_date,
                round(quantile(0.5)(JSONExtractFloat64(properties, 'fps')), 1) AS p50,
                round(quantile(0.95)(JSONExtractFloat64(properties, 'fps')), 1) AS p95,
                round(quantile(0.99)(JSONExtractFloat64(properties, 'fps')), 1) AS p99
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND event_type = 'fps_sample'
                AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
              GROUP BY event_date
              ORDER BY event_date
            `,
            query_params: input,
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
            query_params: input,
          }),
          ch.query({
            format: "JSON",
            query: `
              WITH JSONExtractFloat64(properties, 'ms') AS ms
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
            query_params: input,
          }),
          ch.query({
            format: "JSON",
            query: `
              SELECT
                JSONExtractString(properties, 'map') AS map,
                round(avgIf(JSONExtractFloat64(properties, 'fps'), event_type = 'fps_sample'), 1) AS avg_fps,
                round(quantileIf(0.95)(JSONExtractFloat64(properties, 'fps'), event_type = 'fps_sample'), 1) AS p95_fps,
                countIf(event_type = 'crash') AS crashes
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND event_type IN ('fps_sample', 'crash')
                AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
              GROUP BY map
              HAVING map != ''
              ORDER BY avg_fps DESC
              LIMIT 50
            `,
            query_params: input,
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
      const [lifetimeResult, sessionsResult, timelineResult] =
        await Promise.all([
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
              ORDER BY started_at DESC
              LIMIT 50
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
        ]);

      const [lifetimeJson, sessionsJson, timelineJson] = await Promise.all([
        lifetimeResult.json<z.infer<typeof playerLifetimeRow>>(),
        sessionsResult.json<z.infer<typeof playerSessionRow>>(),
        timelineResult.json<z.infer<typeof playerTimelineRow>>(),
      ]);

      return playerProfileOutput.parse({
        lifetime: lifetimeJson.data[0],
        sessions: sessionsJson.data,
        timeline: timelineJson.data,
      });
    }),
};
