// Pure ClickHouse query builders for the sessionEvents route.
// No DB/network access — fully unit-testable.
import type { Filter } from "../query-builder";
import { applyFilters } from "../query-builder";
import type { BuiltQuery } from "./types";

export interface SessionEventsInput {
  projectId: string;
  sessionId: string;
  filters?: Filter[];
  joinOperator: "and" | "or";
  page: number;
  perPage: number;
  sortBy?: string;
  sortDesc: boolean;
}

const SAFE_SORT_COLUMNS = new Set(["timestamp", "event_type"]);

// Shared WHERE/params construction so the rows and count queries filter the
// same session. `extra` adds the rows-only pagination params.
const buildWhere = (
  input: SessionEventsInput,
  extra: Record<string, unknown>
): { whereClause: string; params: Record<string, unknown> } => {
  const params: Record<string, unknown> = {
    projectId: input.projectId,
    sessionId: input.sessionId,
    ...extra,
  };
  const conditions = [
    "project_id = {projectId:String}",
    "session_id = {sessionId:String}",
  ];
  for (const condition of applyFilters(input.filters, params)) {
    conditions.push(condition);
  }
  return { params, whereClause: conditions.join(" AND ") };
};

// One page of a session's event log.
export const buildSessionEventsQuery = (
  input: SessionEventsInput
): BuiltQuery => {
  const sortCol =
    input.sortBy && SAFE_SORT_COLUMNS.has(input.sortBy)
      ? input.sortBy
      : "timestamp";
  const sortDir = input.sortDesc ? "DESC" : "ASC";
  const offset = (input.page - 1) * input.perPage;

  const { params, whereClause } = buildWhere(input, {
    offset,
    perPage: input.perPage,
  });

  const query = `
            SELECT
              event_type,
              toString(timestamp) AS timestamp,
              properties
            FROM analytics.events
            WHERE ${whereClause}
            ORDER BY ${sortCol} ${sortDir}
            LIMIT {perPage:UInt32} OFFSET {offset:UInt32}
          `;

  return { params, query };
};

// Count of matching events, so pagination reflects the filtered total.
export const buildSessionEventsCountQuery = (
  input: SessionEventsInput
): BuiltQuery => {
  const { params, whereClause } = buildWhere(input, {});

  const query = `
            SELECT count() AS total
            FROM analytics.events
            WHERE ${whereClause}
          `;

  return { params, query };
};
