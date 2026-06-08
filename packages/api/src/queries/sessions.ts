// Pure ClickHouse query builders for the sessions route.
// No DB/network access — fully unit-testable.
import type { BuiltQuery } from "./types";

export interface SessionsInput {
  projectId: string;
  from: string;
  to: string;
}

// Per-session duration CTE derived from the sessions_summary AggregatingMergeTree.
// Exported because later passes (sessionsList/sessionProfile) reuse the same
// session/duration derivation.
export const SESSIONS_CTE = `
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

const sessionsParams = (input: SessionsInput): Record<string, unknown> => ({
  from: input.from,
  projectId: input.projectId,
  to: input.to,
});

// Session duration histogram, bucketed by duration ranges.
export const buildSessionsHistogramQuery = (
  input: SessionsInput
): BuiltQuery => {
  const query = `${SESSIONS_CTE}
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
          `;

  return { params: sessionsParams(input), query };
};

// Average session duration trend per day.
export const buildSessionsTrendQuery = (input: SessionsInput): BuiltQuery => {
  const query = `${SESSIONS_CTE}
            SELECT
              toString(event_date)        AS event_date,
              toUInt64(round(avg(duration))) AS avg_seconds
            FROM sessions
            GROUP BY event_date
            ORDER BY event_date
          `;

  return { params: sessionsParams(input), query };
};

// Time-of-day heatmap of session starts, by weekday and hour.
export const buildSessionsHeatmapQuery = (input: SessionsInput): BuiltQuery => {
  const query = `${SESSIONS_CTE}
            SELECT
              toUInt8(toDayOfWeek(started_at)) AS weekday,
              toUInt8(toHour(started_at))      AS hour,
              toUInt64(count())                AS sessions
            FROM sessions
            GROUP BY weekday, hour
            ORDER BY weekday, hour
          `;

  return { params: sessionsParams(input), query };
};
