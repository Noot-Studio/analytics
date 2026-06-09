// Pure ClickHouse query builders for alert evaluation. No DB/network access —
// fully unit-testable, mirroring the builders under ../queries.
import type { BuiltQuery } from "../queries/types";

// DateTime64 rejects the ISO `Z` suffix; the column is already UTC, so dropping
// it preserves the instant (same trick as ../queries/recent).
const ISO_Z_SUFFIX = /Z$/u;
const stripZ = (iso: string): string => iso.replace(ISO_Z_SUFFIX, "");

export interface CrashCountInput {
  projectId: string;
  // Half-open window [from, to) as ISO datetimes.
  from: string;
  to: string;
}

// Crash events for a project within a time window — backs the crash-spike rule.
export const buildCrashCountQuery = (input: CrashCountInput): BuiltQuery => {
  const params = {
    from: stripZ(input.from),
    projectId: input.projectId,
    to: stripZ(input.to),
  };

  const query = `
          SELECT count() AS crashes
          FROM analytics.events
          WHERE project_id = {projectId:String}
            AND event_type = 'crash'
            AND timestamp >= {from:DateTime64(3)}
            AND timestamp < {to:DateTime64(3)}
        `;

  return { params, query };
};

export interface CurrentDauInput {
  projectId: string;
  // Calendar day (UTC) as YYYY-MM-DD.
  day: string;
}

// Distinct players active on a single day — the current side of a DAU-drop rule.
export const buildCurrentDauQuery = (input: CurrentDauInput): BuiltQuery => {
  const params = { day: input.day, projectId: input.projectId };

  const query = `
          SELECT uniq(player_id) AS dau
          FROM analytics.events
          WHERE project_id = {projectId:String}
            AND toDate(timestamp) = {day:Date}
        `;

  return { params, query };
};

export interface BaselineDauInput {
  projectId: string;
  // Inclusive day range [from, to] (UTC) as YYYY-MM-DD.
  from: string;
  to: string;
}

// Average daily DAU over a trailing window — the baseline a DAU-drop rule
// compares the current day against.
export const buildBaselineDauQuery = (input: BaselineDauInput): BuiltQuery => {
  const params = {
    from: input.from,
    projectId: input.projectId,
    to: input.to,
  };

  const query = `
          SELECT round(avg(daily_dau)) AS dau
          FROM (
            SELECT toDate(timestamp) AS event_date, uniq(player_id) AS daily_dau
            FROM analytics.events
            WHERE project_id = {projectId:String}
              AND toDate(timestamp) BETWEEN {from:Date} AND {to:Date}
            GROUP BY event_date
          )
        `;

  return { params, query };
};
