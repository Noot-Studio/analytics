// Pure ClickHouse query builders for alert evaluation. No DB/network access —
// fully unit-testable. Both builders take a `projectIds` array so the same SQL
// serves a single-project rule and an org-wide rule (every project in the org).
import type { BuiltQuery } from "../queries/types";

export interface CrashCountInput {
  projectIds: string[];
  // ISO timestamp; crashes at or after this instant are counted.
  since: string;
}

// Crash events across the scope since `since` (the crash-spike window).
export const buildCrashCountQuery = (input: CrashCountInput): BuiltQuery => {
  const query = `
          SELECT count() AS crashes
          FROM analytics.events
          WHERE project_id IN {projectIds:Array(String)}
            AND event_type = 'crash'
            AND timestamp >= parseDateTimeBestEffort({since:String})
        `;

  return {
    params: { projectIds: input.projectIds, since: input.since },
    query,
  };
};

export interface DauWindowInput {
  projectIds: string[];
  // Day being checked (YYYY-MM-DD).
  today: string;
  // Earliest day of the trailing baseline window (YYYY-MM-DD), inclusive.
  baselineFrom: string;
}

// Current-day DAU and the trailing-window average, from the daily rollup.
// Grouping by date merges every project + event_type for that day, so the
// per-day figure is distinct players across the scope (i.e. DAU).
export const buildDauWindowQuery = (input: DauWindowInput): BuiltQuery => {
  const query = `
          SELECT
            sumIf(daily, d = {today:Date})                      AS current_dau,
            ifNotFinite(avgIf(daily, d < {today:Date}), 0)      AS baseline_dau
          FROM (
            SELECT
              event_date                            AS d,
              toUInt64(uniqMerge(unique_players))   AS daily
            FROM analytics.events_daily
            WHERE project_id IN {projectIds:Array(String)}
              AND event_date BETWEEN {baselineFrom:Date} AND {today:Date}
            GROUP BY event_date
          )
        `;

  return {
    params: {
      baselineFrom: input.baselineFrom,
      projectIds: input.projectIds,
      today: input.today,
    },
    query,
  };
};
