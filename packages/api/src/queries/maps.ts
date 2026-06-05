// Pure ClickHouse query builders for the maps route.
// No DB/network access — fully unit-testable.
import type { ColumnFilterDef, Filter } from "../query-builder";
import { buildColumnFilters } from "../query-builder";
import type { BuiltQuery } from "./types";

export interface MapsInput {
  projectId: string;
  from: string;
  to: string;
  filters?: Filter[];
  joinOperator: "and" | "or";
  page: number;
  perPage: number;
  sortBy?: "map" | "sessions" | "players" | "avg_seconds";
  sortDesc: boolean;
}

// Filterable/sortable columns for the per-map table. `map` is the GROUP BY key;
// the rest are aggregate aliases — all referenced via HAVING / ORDER BY.
const MAPS_TABLE_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  avg_seconds: { expr: "avg_seconds", type: "number" },
  map: { expr: "map", type: "string" },
  players: { expr: "players", type: "number" },
  sessions: { expr: "sessions", type: "number" },
};

const MAPS_SORT_COLS = {
  avg_seconds: "avg_seconds",
  map: "map",
  players: "players",
  sessions: "sessions",
} as const;

// Per-map/mode breakdown derived from session_start events plus durations.
const MAPS_CTE = `
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

const MAPS_TABLE_SELECT = `
        SELECT
          m.map                            AS map,
          toUInt64(uniq(m.session_id))     AS sessions,
          toUInt64(uniq(m.player_id))      AS players,
          toUInt64(round(avg(d.duration))) AS avg_seconds
        FROM session_maps AS m
        LEFT JOIN durations AS d USING (session_id)
        WHERE m.map != ''
        GROUP BY m.map`;

function windowParams(input: MapsInput): Record<string, unknown> {
  return {
    from: input.from,
    projectId: input.projectId,
    to: input.to,
  };
}

// Top-N maps by sessions, unaffected by table paging — drives the charts.
export function buildMapsBreakdownQuery(input: MapsInput): BuiltQuery {
  const query = `${MAPS_CTE}
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
          `;

  return { params: windowParams(input), query };
}

// Per-day sessions per map for the stacked over-time chart.
export function buildMapsOverTimeQuery(input: MapsInput): BuiltQuery {
  const query = `${MAPS_CTE}
            SELECT
              toString(event_date)         AS event_date,
              map                          AS map,
              toUInt64(uniq(session_id))   AS sessions
            FROM session_maps
            WHERE map != ''
            GROUP BY event_date, map
            ORDER BY event_date, sessions DESC
          `;

  return { params: windowParams(input), query };
}

// Server-side filtered/sorted/paginated rows for the data-table.
export function buildMapsTableQuery(input: MapsInput): BuiltQuery {
  const tableSortCol = input.sortBy
    ? (MAPS_SORT_COLS[input.sortBy] ?? "sessions")
    : "sessions";
  const tableSortDir = input.sortDesc ? "DESC" : "ASC";
  const tableOffset = (input.page - 1) * input.perPage;

  const params: Record<string, unknown> = {
    from: input.from,
    offset: tableOffset,
    perPage: input.perPage,
    projectId: input.projectId,
    to: input.to,
  };
  const tableFilter = buildColumnFilters(
    input.filters,
    MAPS_TABLE_FILTER_COLUMNS,
    params,
    input.joinOperator
  );
  const tableHaving = tableFilter ? `HAVING ${tableFilter}` : "";

  const query = `${MAPS_CTE}
            ${MAPS_TABLE_SELECT}
            ${tableHaving}
            ORDER BY ${tableSortCol} ${tableSortDir}
            LIMIT {perPage:UInt32} OFFSET {offset:UInt32}
          `;

  return { params, query };
}

// Count of filtered table rows, so pagination reflects the filtered total.
export function buildMapsTableCountQuery(input: MapsInput): BuiltQuery {
  const params: Record<string, unknown> = {
    from: input.from,
    projectId: input.projectId,
    to: input.to,
  };
  const countFilter = buildColumnFilters(
    input.filters,
    MAPS_TABLE_FILTER_COLUMNS,
    params,
    input.joinOperator
  );
  const countHaving = countFilter ? `HAVING ${countFilter}` : "";

  const query = `
            SELECT count() AS total FROM (
              ${MAPS_CTE}
              ${MAPS_TABLE_SELECT}
              ${countHaving}
            )
          `;

  return { params, query };
}
