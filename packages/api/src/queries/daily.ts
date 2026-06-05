// Pure ClickHouse query builder for the daily rollup route.
// No DB/network access — fully unit-testable.
import type { BuiltQuery } from "./types";

export interface DailyInput {
  projectId: string;
  from: string;
  to: string;
}

// Daily rollup powered by the AggregatingMergeTree in ClickHouse.
export function buildDailyQuery(input: DailyInput): BuiltQuery {
  const params: Record<string, unknown> = {
    from: input.from,
    projectId: input.projectId,
    to: input.to,
  };

  const query = `
          SELECT
            event_date                       AS event_date,
            event_type                        AS event_type,
            toUInt64(uniqMerge(unique_players))  AS unique_players,
            toUInt64(uniqMerge(unique_sessions)) AS unique_sessions,
            toUInt64(countMerge(event_count))    AS event_count
          FROM analytics.events_daily
          WHERE project_id = {projectId:String}
            AND event_date BETWEEN {from:Date} AND {to:Date}
          GROUP BY event_date, event_type
          ORDER BY event_date, event_type
        `;

  return { params, query };
}
