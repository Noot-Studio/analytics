// Pure ClickHouse query builders for the sessionsList route.
// No DB/network access — fully unit-testable.
import type { ColumnFilterDef, Filter } from "../query-builder";
import { buildColumnFilters } from "../query-builder";
import type { BuiltQuery } from "./types";

export interface SessionsListInput {
  projectId: string;
  from: string;
  to: string;
  filters?: Filter[];
  joinOperator: "and" | "or";
  page: number;
  perPage: number;
  sortBy?: string;
  sortDesc: boolean;
}

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

const SAFE_SORT_COLUMNS: Record<string, string> = {
  duration_seconds: "duration_seconds",
  event_count: "event_count",
  started_at: "started_at",
};

const ISO_Z_SUFFIX = /Z$/u;

// Shared params + session-select construction so the rows and count queries
// filter the same window.
function buildSessionSelect(
  input: SessionsListInput,
  extra: Record<string, unknown>
): { sessionSelect: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {
    from: input.from.replace(ISO_Z_SUFFIX, ""),
    projectId: input.projectId,
    to: input.to.replace(ISO_Z_SUFFIX, ""),
    ...extra,
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

  return { params, sessionSelect };
}

// One page of browsable sessions in the range.
export function buildSessionsListQuery(input: SessionsListInput): BuiltQuery {
  const sortCol = input.sortBy
    ? (SAFE_SORT_COLUMNS[input.sortBy] ?? "started_at")
    : "started_at";
  const sortDir = input.sortDesc ? "DESC" : "ASC";
  const offset = (input.page - 1) * input.perPage;

  const { params, sessionSelect } = buildSessionSelect(input, {
    offset,
    perPage: input.perPage,
  });

  const query = `
            ${sessionSelect}
            ORDER BY ${sortCol} ${sortDir}
            LIMIT {perPage:UInt32} OFFSET {offset:UInt32}
          `;

  return { params, query };
}

// Count of filtered sessions, so pagination reflects the filtered total.
export function buildSessionsListCountQuery(
  input: SessionsListInput
): BuiltQuery {
  const { params, sessionSelect } = buildSessionSelect(input, {});

  const query = `SELECT count() AS total FROM (${sessionSelect})`;

  return { params, query };
}
