// Pure ClickHouse query builders for the players route.
// No DB/network access — fully unit-testable.
import type { BuiltQuery } from "./types";

export interface PlayersInput {
  projectId: string;
  from: string;
  to: string;
}

// DAU + new-vs-returning daily series.
export const buildPlayersDailyQuery = (input: PlayersInput): BuiltQuery => {
  const params: Record<string, unknown> = {
    from: input.from,
    projectId: input.projectId,
    to: input.to,
  };

  const query = `
          WITH active AS (
            SELECT
              toDate(timestamp) AS event_date,
              player_id
            FROM analytics.events
            WHERE project_id = {projectId:String}
              AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
            GROUP BY event_date, player_id
          ),
          firsts AS (
            SELECT player_id, minMerge(first_seen) AS first_seen
            FROM analytics.player_first_seen
            WHERE project_id = {projectId:String}
            GROUP BY player_id
          )
          SELECT
            a.event_date                                   AS event_date,
            toUInt64(uniq(a.player_id))                    AS dau,
            toUInt64(uniqIf(a.player_id, f.first_seen = a.event_date)) AS new_players,
            toUInt64(uniqIf(a.player_id, f.first_seen < a.event_date)) AS returning_players
          FROM active AS a
          LEFT JOIN firsts AS f USING (player_id)
          GROUP BY a.event_date
          ORDER BY a.event_date
        `;

  return { params, query };
};

// Trailing WAU/MAU totals over the 30-day window ending at `to`.
export const buildPlayersTotalsQuery = (input: PlayersInput): BuiltQuery => {
  const params: Record<string, unknown> = {
    from: input.from,
    projectId: input.projectId,
    to: input.to,
  };

  const query = `
          SELECT
            toUInt64(uniqIf(player_id, timestamp >= {to:Date} - INTERVAL 7 DAY))  AS wau,
            toUInt64(uniqIf(player_id, timestamp >= {to:Date} - INTERVAL 30 DAY)) AS mau
          FROM analytics.events
          WHERE project_id = {projectId:String}
            AND toDate(timestamp) BETWEEN ({to:Date} - INTERVAL 30 DAY) AND {to:Date}
        `;

  return { params, query };
};
