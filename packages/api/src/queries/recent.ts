// Pure ClickHouse query builders for the recent-events live stream route.
// No DB/network access — fully unit-testable.
import type { Filter } from "../query-builder";
import { applyFilters } from "../query-builder";
import type { BuiltQuery } from "./types";

export interface RecentInput {
  projectId: string;
  from?: string;
  to?: string;
  filters?: Filter[];
  page: number;
  perPage: number;
  sortBy?: string;
  sortDesc: boolean;
}

const SAFE_SORT_COLUMNS = new Set([
  "timestamp",
  "event_type",
  "player_id",
  "session_id",
]);

const ISO_Z_SUFFIX = /Z$/u;

// Shared WHERE/params construction so the rows and count queries filter the
// same window. `extra` adds the rows-only pagination params.
const buildWhere = (
  input: RecentInput,
  extra: Record<string, unknown>
): { whereClause: string; params: Record<string, unknown> } => {
  const params: Record<string, unknown> = {
    projectId: input.projectId,
    ...extra,
  };
  const conditions = ["project_id = {projectId:String}"];
  if (input.from && input.to) {
    conditions.push(
      "timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}"
    );
    // ClickHouse DateTime64 rejects the ISO `Z` suffix; the column is
    // already UTC, so dropping it preserves the instant.
    params.from = input.from.replace(ISO_Z_SUFFIX, "");
    params.to = input.to.replace(ISO_Z_SUFFIX, "");
  }
  for (const condition of applyFilters(input.filters, params)) {
    conditions.push(condition);
  }
  return { params, whereClause: conditions.join(" AND ") };
};

// Most recent raw events page for the dashboard's live stream view.
export const buildRecentRowsQuery = (input: RecentInput): BuiltQuery => {
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
              timestamp,
              session_id,
              player_id,
              properties
            FROM analytics.events
            WHERE ${whereClause}
            ORDER BY ${sortCol} ${sortDir}
            LIMIT {perPage:UInt32} OFFSET {offset:UInt32}
          `;

  return { params, query };
};

// Total matching events, so pagination reflects the filtered total.
export const buildRecentCountQuery = (input: RecentInput): BuiltQuery => {
  const { params, whereClause } = buildWhere(input, {});

  const query = `
            SELECT count() AS total
            FROM analytics.events
            WHERE ${whereClause}
          `;

  return { params, query };
};
