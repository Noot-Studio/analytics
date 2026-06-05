// Pure ClickHouse query builders for the retention route.
// No DB/network access — fully unit-testable.
import type { ColumnFilterDef, Filter } from "../query-builder";
import { buildColumnFilters } from "../query-builder";
import type { BuiltQuery } from "./types";

export interface RetentionInput {
  projectId: string;
  from: string;
  to: string;
  filters?: Filter[];
  joinOperator: "and" | "or";
  page: number;
  perPage: number;
  sortBy?: "cohort_date" | "size" | "d1" | "d7" | "d30";
  sortDesc: boolean;
}

// Cohort table columns: cohort_date is the GROUP BY key, the rest are aggregate
// aliases — all referenced via HAVING / ORDER BY.
const RETENTION_COHORT_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  cohort_date: { expr: "cohort_date", type: "string" },
  d1: { expr: "d1", type: "number" },
  d30: { expr: "d30", type: "number" },
  d7: { expr: "d7", type: "number" },
  size: { expr: "size", type: "number" },
};

const RETENTION_SORT_COLS = {
  cohort_date: "cohort_date",
  d1: "d1",
  d30: "d30",
  d7: "d7",
  size: "size",
} as const;

// Cohorts (players' first-seen dates) joined to their later activity, producing
// one row per (cohort_date, player_id, day_offset) within the 30-day window.
const RETENTION_CTE = `
        WITH cohorts AS (
          SELECT player_id, minMerge(first_seen) AS cohort_date
          FROM analytics.player_first_seen
          WHERE project_id = {projectId:String}
          GROUP BY player_id
          HAVING cohort_date BETWEEN {from:Date} AND {to:Date}
        ),
        activity AS (
          SELECT DISTINCT player_id, toDate(timestamp) AS active_date
          FROM analytics.events
          WHERE project_id = {projectId:String}
            AND toDate(timestamp) BETWEEN {from:Date} AND addDays({to:Date}, 30)
        ),
        joined AS (
          SELECT
            c.cohort_date AS cohort_date,
            c.player_id   AS player_id,
            dateDiff('day', c.cohort_date, a.active_date) AS day_offset
          FROM cohorts AS c
          INNER JOIN activity AS a USING (player_id)
          WHERE a.active_date >= c.cohort_date
            AND dateDiff('day', c.cohort_date, a.active_date) <= 30
        )
      `;

// d1/d7/d30 are emitted as whole-percent retention rates so the table
// sorts/filters on the same numbers it displays. nullIf guards the
// empty-cohort divide.
const RETENTION_COHORT_SELECT = `
        SELECT
          toString(cohort_date)                            AS cohort_date,
          toUInt64(uniqExactIf(player_id, day_offset = 0)) AS size,
          ifNull(round(uniqExactIf(player_id, day_offset = 1)  / nullIf(uniqExactIf(player_id, day_offset = 0), 0) * 100), 0) AS d1,
          ifNull(round(uniqExactIf(player_id, day_offset = 7)  / nullIf(uniqExactIf(player_id, day_offset = 0), 0) * 100), 0) AS d7,
          ifNull(round(uniqExactIf(player_id, day_offset = 30) / nullIf(uniqExactIf(player_id, day_offset = 0), 0) * 100), 0) AS d30
        FROM joined
        GROUP BY cohort_date`;

// Server-side filtered/sorted/paginated cohort rows for the data-table.
export function buildRetentionTableQuery(input: RetentionInput): BuiltQuery {
  const tableSortCol = input.sortBy
    ? (RETENTION_SORT_COLS[input.sortBy] ?? "cohort_date")
    : "cohort_date";
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
    RETENTION_COHORT_FILTER_COLUMNS,
    params,
    input.joinOperator
  );
  const tableHaving = tableFilter ? `HAVING ${tableFilter}` : "";

  const query = `${RETENTION_CTE}
            ${RETENTION_COHORT_SELECT}
            ${tableHaving}
            ORDER BY ${tableSortCol} ${tableSortDir}
            LIMIT {perPage:UInt32} OFFSET {offset:UInt32}
          `;

  return { params, query };
}

// Count of filtered cohort rows, so pagination reflects the filtered total.
export function buildRetentionTableCountQuery(
  input: RetentionInput
): BuiltQuery {
  const params: Record<string, unknown> = {
    from: input.from,
    projectId: input.projectId,
    to: input.to,
  };
  const countFilter = buildColumnFilters(
    input.filters,
    RETENTION_COHORT_FILTER_COLUMNS,
    params,
    input.joinOperator
  );
  const countHaving = countFilter ? `HAVING ${countFilter}` : "";

  const query = `
            SELECT count() AS total FROM (
              ${RETENTION_CTE}
              ${RETENTION_COHORT_SELECT}
              ${countHaving}
            )
          `;

  return { params, query };
}

// Aggregate retention curve — retained players per day_offset, over cohorts old
// enough to have a full 30-day window.
export function buildRetentionCurveQuery(input: RetentionInput): BuiltQuery {
  const params: Record<string, unknown> = {
    from: input.from,
    projectId: input.projectId,
    to: input.to,
  };

  const query = `${RETENTION_CTE}
            SELECT
              day_offset,
              toUInt64(uniqExact(player_id)) AS retained
            FROM joined
            WHERE cohort_date <= {to:Date} - 30
            GROUP BY day_offset
            ORDER BY day_offset
          `;

  return { params, query };
}
