// Pure ClickHouse query builders for the playersList route.
// No DB/network access — fully unit-testable.
import type { ColumnFilterDef, Filter } from "../query-builder";
import { buildColumnFilters } from "../query-builder";
import type { BuiltQuery } from "./types";

export interface PlayersListInput {
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

// Browsable-player list filters — all aggregate aliases (player_id is the
// GROUP BY key), applied via HAVING and mirrored into the count subquery.
const PLAYERS_LIST_FILTER_COLUMNS: Record<string, ColumnFilterDef> = {
  events: { expr: "events", type: "number" },
  first_seen: { expr: "first_seen", type: "string" },
  last_seen: { expr: "last_seen", type: "string" },
  player_id: { expr: "player_id", type: "string" },
  sessions: { expr: "sessions", type: "number" },
};

const SAFE_SORT_COLUMNS: Record<string, string> = {
  events: "events",
  first_seen: "first_seen",
  last_seen: "last_seen",
  sessions: "sessions",
};

const ISO_Z_SUFFIX = /Z$/u;

// Shared params + player-select construction so the rows and count queries
// filter the same window. Anonymous activity (empty player_id) groups into a
// single non-clickable row, so exclude it from the browsable list.
const buildPlayerSelect = (
  input: PlayersListInput,
  extra: Record<string, unknown>
): { playerSelect: string; params: Record<string, unknown> } => {
  const params: Record<string, unknown> = {
    from: input.from.replace(ISO_Z_SUFFIX, ""),
    projectId: input.projectId,
    to: input.to.replace(ISO_Z_SUFFIX, ""),
    ...extra,
  };
  const havingCondition = buildColumnFilters(
    input.filters,
    PLAYERS_LIST_FILTER_COLUMNS,
    params,
    input.joinOperator
  );
  const havingClause = havingCondition ? `HAVING ${havingCondition}` : "";

  const playerSelect = `
        SELECT
          player_id,
          toString(min(timestamp)) AS first_seen,
          toString(max(timestamp)) AS last_seen,
          uniq(session_id) AS sessions,
          count() AS events
        FROM analytics.events
        WHERE project_id = {projectId:String}
          AND player_id != ''
          AND timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}
        GROUP BY player_id
        ${havingClause}
      `;

  return { params, playerSelect };
};

// One page of browsable players active in the range.
export const buildPlayersListQuery = (input: PlayersListInput): BuiltQuery => {
  const sortCol = input.sortBy
    ? (SAFE_SORT_COLUMNS[input.sortBy] ?? "last_seen")
    : "last_seen";
  const sortDir = input.sortDesc ? "DESC" : "ASC";
  const offset = (input.page - 1) * input.perPage;

  const { params, playerSelect } = buildPlayerSelect(input, {
    offset,
    perPage: input.perPage,
  });

  const query = `
            ${playerSelect}
            ORDER BY ${sortCol} ${sortDir}
            LIMIT {perPage:UInt32} OFFSET {offset:UInt32}
          `;

  return { params, query };
};

// Count of filtered players, so pagination reflects the filtered total.
export const buildPlayersListCountQuery = (
  input: PlayersListInput
): BuiltQuery => {
  const { params, playerSelect } = buildPlayerSelect(input, {});

  const query = `SELECT count() AS total FROM (${playerSelect})`;

  return { params, query };
};
