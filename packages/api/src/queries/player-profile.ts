// Pure ClickHouse query builders for the playerProfile route.
// No DB/network access — fully unit-testable.
import type { BuiltQuery } from "./types";

export interface PlayerProfileInput {
  projectId: string;
  playerId: string;
}

const profileParams = (input: PlayerProfileInput): Record<string, unknown> => ({
  playerId: input.playerId,
  projectId: input.projectId,
});

// Per-session durations for one player — shared by the lifetime stats, map
// distribution, and duration histogram queries.
const PLAYER_SESSIONS_CTE = `
          WITH player_sessions AS (
            SELECT
              argMin(JSONExtractString(properties, 'map'), timestamp) AS map,
              dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds
            FROM analytics.events
            WHERE project_id = {projectId:String}
              AND player_id = {playerId:String}
            GROUP BY session_id
          )`;

// Lifetime stats: first/last seen, totals, plus per-session aggregates derived
// from the shared player_sessions CTE.
export const buildPlayerLifetimeQuery = (
  input: PlayerProfileInput
): BuiltQuery => {
  const query = `${PLAYER_SESSIONS_CTE}
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
            `;

  return { params: profileParams(input), query };
};

// Last 12 weeks of daily activity — the profile's calendar window.
export const buildPlayerActivityQuery = (
  input: PlayerProfileInput
): BuiltQuery => {
  const query = `
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
            `;

  return { params: profileParams(input), query };
};

// Event density per weekday × hour — feeds the "when they play" heatmap.
export const buildPlayerHourGridQuery = (
  input: PlayerProfileInput
): BuiltQuery => {
  const query = `
              SELECT
                toUInt8(toDayOfWeek(timestamp)) AS weekday,
                toUInt8(toHour(timestamp))      AS hour,
                toUInt64(count())               AS events
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND player_id = {playerId:String}
              GROUP BY weekday, hour
              ORDER BY weekday, hour
            `;

  return { params: profileParams(input), query };
};

// Per-event-type totals for the player.
export const buildPlayerEventBreakdownQuery = (
  input: PlayerProfileInput
): BuiltQuery => {
  const query = `
              SELECT
                event_type,
                toUInt64(count()) AS count
              FROM analytics.events
              WHERE project_id = {projectId:String}
                AND player_id = {playerId:String}
              GROUP BY event_type
              ORDER BY count DESC
            `;

  return { params: profileParams(input), query };
};

// Per-map session counts and playtime, map taken from each session's first event.
export const buildPlayerMapsQuery = (input: PlayerProfileInput): BuiltQuery => {
  const query = `${PLAYER_SESSIONS_CTE}
              SELECT
                map,
                toUInt64(count()) AS sessions,
                toUInt64(sum(duration_seconds)) AS playtime_seconds
              FROM player_sessions
              GROUP BY map
              ORDER BY sessions DESC, map ASC
            `;

  return { params: profileParams(input), query };
};

// Session duration histogram — same buckets as the project-wide sessions histogram.
export const buildPlayerHistogramQuery = (
  input: PlayerProfileInput
): BuiltQuery => {
  const query = `${PLAYER_SESSIONS_CTE}
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
            `;

  return { params: profileParams(input), query };
};

// Latest hardware/client specs reported on the player's session_start events.
export const buildPlayerSpecsQuery = (
  input: PlayerProfileInput
): BuiltQuery => {
  const query = `
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
            `;

  return { params: profileParams(input), query };
};

// Most recent 100 raw events for the player's timeline.
export const buildPlayerTimelineQuery = (
  input: PlayerProfileInput
): BuiltQuery => {
  const query = `
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
            `;

  return { params: profileParams(input), query };
};

// Per-player retention: cohort = first-seen day; retained_dN is 1 when the
// player had any activity exactly N days after their cohort day.
export const buildPlayerRetentionQuery = (
  input: PlayerProfileInput
): BuiltQuery => {
  const query = `
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
            `;

  return { params: profileParams(input), query };
};
