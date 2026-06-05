// Pure ClickHouse query builder for the event-type breakdown route.
// No DB/network access — fully unit-testable.
import type { ColumnFilterDef, Filter } from "../query-builder";
import { buildColumnFilters } from "../query-builder";
import type { BuiltQuery } from "./types";

export interface BreakdownInput {
  projectId: string;
  from: string;
  to: string;
  filters?: Filter[];
  joinOperator: "and" | "or";
  sortBy: "event_type" | "event_count" | "unique_players";
  sortDesc: boolean;
}

// Filterable columns for the event-type breakdown. event_type is the GROUP BY
// key; the other two are aggregate aliases — all are referenced via HAVING.
const BREAKDOWN_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  event_count: { expr: "event_count", type: "number" },
  event_type: { expr: "event_type", type: "string" },
  unique_players: { expr: "unique_players", type: "number" },
};

const BREAKDOWN_SORT_COLS = {
  event_count: "event_count",
  event_type: "event_type",
  unique_players: "unique_players",
} as const;

export function buildBreakdownQuery(input: BreakdownInput): BuiltQuery {
  const sortCol = BREAKDOWN_SORT_COLS[input.sortBy] ?? "event_count";
  const sortDir = input.sortDesc ? "DESC" : "ASC";

  const params: Record<string, unknown> = {
    from: input.from,
    projectId: input.projectId,
    to: input.to,
  };
  const having = buildColumnFilters(
    input.filters,
    BREAKDOWN_FILTER_COLUMNS,
    params,
    input.joinOperator
  );
  const havingClause = having ? `HAVING ${having}` : "";

  const query = `
          SELECT
            event_type                           AS event_type,
            toUInt64(countMerge(event_count))    AS event_count,
            toUInt64(uniqMerge(unique_players))  AS unique_players
          FROM analytics.events_daily
          WHERE project_id = {projectId:String}
            AND event_date BETWEEN {from:Date} AND {to:Date}
          GROUP BY event_type
          ${havingClause}
          ORDER BY ${sortCol} ${sortDir}
        `;

  return { params, query };
}
