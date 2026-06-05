// Pure ClickHouse query builders for the sessionProfile route.
// No DB/network access — fully unit-testable.
import type { BuiltQuery } from "./types";

export interface SessionProfileInput {
  projectId: string;
  sessionId: string;
}

function profileParams(input: SessionProfileInput): Record<string, unknown> {
  return { projectId: input.projectId, sessionId: input.sessionId };
}

// Session meta header: player, start/end, duration, event count, and map.
export function buildSessionMetaQuery(input: SessionProfileInput): BuiltQuery {
  const query = `
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
          `;

  return { params: profileParams(input), query };
}

// In-session performance digest: FPS from fps_sample events, load time from
// load_complete, deaths/crashes from their respective event types.
export function buildSessionPerfQuery(input: SessionProfileInput): BuiltQuery {
  const query = `
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
          `;

  return { params: profileParams(input), query };
}

// FPS samples positioned by seconds since session start.
export function buildSessionFpsQuery(input: SessionProfileInput): BuiltQuery {
  const query = `
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
          `;

  return { params: profileParams(input), query };
}

// Per-event-type totals for the session.
export function buildSessionBreakdownQuery(
  input: SessionProfileInput
): BuiltQuery {
  const query = `
            SELECT
              event_type,
              toUInt64(count()) AS count
            FROM analytics.events
            WHERE project_id = {projectId:String}
              AND session_id = {sessionId:String}
            GROUP BY event_type
            ORDER BY count DESC
          `;

  return { params: profileParams(input), query };
}

// Hardware/client specs reported on this session's session_start.
export function buildSessionSpecsQuery(input: SessionProfileInput): BuiltQuery {
  const query = `
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
          `;

  return { params: profileParams(input), query };
}
