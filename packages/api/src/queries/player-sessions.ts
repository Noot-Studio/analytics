// Pure ClickHouse query builders for the playerSessions route.
// No DB/network access — fully unit-testable.
import type { ColumnFilterDef, Filter } from "../query-builder";
import { buildColumnFilters } from "../query-builder";
import type { BuiltQuery } from "./types";

export interface PlayerSessionsInput {
  projectId: string;
  playerId: string;
  filters?: Filter[];
  joinOperator: "and" | "or";
  page: number;
  perPage: number;
  sortBy?: "started_at" | "duration_seconds" | "event_count";
  sortDesc: boolean;
}

// Filterable columns for a player's session history — all per-session aggregate
// aliases, applied via HAVING (and mirrored into the paginated count subquery).
const PLAYER_SESSION_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  duration_seconds: { expr: "duration_seconds", type: "number" },
  event_count: { expr: "event_count", type: "number" },
  map: { expr: "map", type: "string" },
  started_at: { expr: "started_at", type: "string" },
};

// Shared params + HAVING construction so the page and count queries filter the
// same per-session aggregate aliases. `extra` adds the rows-only pagination.
function buildHaving(
  input: PlayerSessionsInput,
  extra: Record<string, unknown>
): { havingClause: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {
    playerId: input.playerId,
    projectId: input.projectId,
    ...extra,
  };
  const filterCondition = buildColumnFilters(
    input.filters,
    PLAYER_SESSION_FILTER_COLUMNS,
    params,
    input.joinOperator
  );
  return {
    havingClause: filterCondition ? `HAVING ${filterCondition}` : "",
    params,
  };
}

// One page of a player's session history.
export function buildPlayerSessionsQuery(
  input: PlayerSessionsInput
): BuiltQuery {
  const sortColumn = input.sortBy ?? "started_at";
  const sortDir = input.sortDesc ? "DESC" : "ASC";
  const offset = (input.page - 1) * input.perPage;

  const { havingClause, params } = buildHaving(input, {
    offset,
    perPage: input.perPage,
  });

  const query = `
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
            `;

  return { params, query };
}

// Count of filtered sessions, so pagination reflects the filtered total.
export function buildPlayerSessionsCountQuery(
  input: PlayerSessionsInput
): BuiltQuery {
  const { havingClause, params } = buildHaving(input, {});

  const query = `
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
            `;

  return { params, query };
}
