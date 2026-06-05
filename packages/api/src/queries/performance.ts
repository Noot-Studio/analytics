// Pure ClickHouse query builders for the performance route.
// No DB/network access — fully unit-testable.
import type { ColumnFilterDef, Filter } from "../query-builder";
import { buildColumnFilters } from "../query-builder";
import type { BuiltQuery } from "./types";

export interface PerformanceInput {
  projectId: string;
  from: string;
  to: string;
  mapFilters?: Filter[];
  mapJoinOperator: "and" | "or";
  mapSortBy?: "map" | "avg_fps" | "p95_fps" | "crashes";
  mapSortDesc: boolean;
}

// Filterable columns for the per-map performance table — all are SELECT aliases
// over aggregates, so they are applied via HAVING alongside the `map != ''` guard.
const PERFORMANCE_MAP_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  avg_fps: { expr: "avg_fps", type: "number" },
  crashes: { expr: "crashes", type: "number" },
  map: { expr: "map", type: "string" },
  p95_fps: { expr: "p95_fps", type: "number" },
};

const MAP_SORT_COLS = {
  avg_fps: "avg_fps",
  crashes: "crashes",
  map: "map",
  p95_fps: "p95_fps",
} as const;

function windowParams(input: PerformanceInput): Record<string, unknown> {
  return {
    from: input.from,
    projectId: input.projectId,
    to: input.to,
  };
}

// Daily FPS percentiles (p50/p95/p99) from fps_sample events.
export function buildPerformanceFpsQuery(input: PerformanceInput): BuiltQuery {
  const query = `
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
            `;

  return { params: windowParams(input), query };
}

// Daily crash counts, sessions, and crash rate.
export function buildPerformanceCrashQuery(
  input: PerformanceInput
): BuiltQuery {
  const query = `
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
            `;

  return { params: windowParams(input), query };
}

// Load-time histogram bucketed by load_complete `ms`.
export function buildPerformanceLoadQuery(input: PerformanceInput): BuiltQuery {
  const query = `
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
            `;

  return { params: windowParams(input), query };
}

// Per-map FPS and crash aggregates, filtered/sorted server-side.
export function buildPerformanceByMapQuery(
  input: PerformanceInput
): BuiltQuery {
  const mapSortCol = input.mapSortBy
    ? (MAP_SORT_COLS[input.mapSortBy] ?? "avg_fps")
    : "avg_fps";
  const mapSortDir = input.mapSortDesc ? "DESC" : "ASC";

  // byMap filters apply to aggregate aliases, so they extend the HAVING
  // clause. Bind into a dedicated param object scoped to that one query.
  const params: Record<string, unknown> = { ...windowParams(input) };
  const mapFilterCondition = buildColumnFilters(
    input.mapFilters,
    PERFORMANCE_MAP_FILTER_COLUMNS,
    params,
    input.mapJoinOperator
  );
  const mapHaving = mapFilterCondition
    ? `map != '' AND ${mapFilterCondition}`
    : "map != ''";

  const query = `
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
            `;

  return { params, query };
}
