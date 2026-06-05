import { describe, expect, it } from "bun:test";

import {
  buildSessionsHeatmapQuery,
  buildSessionsHistogramQuery,
  buildSessionsTrendQuery,
  SESSIONS_CTE,
} from "./sessions";

const input = {
  from: "2026-05-01",
  projectId: "proj_1",
  to: "2026-06-01",
};

describe("SESSIONS_CTE", () => {
  it("derives per-session durations from sessions_summary", () => {
    expect(SESSIONS_CTE).toContain("WITH sessions AS");
    expect(SESSIONS_CTE).toContain("FROM analytics.sessions_summary");
    expect(SESSIONS_CTE).toContain(
      "dateDiff('second', started_at, ended_at) AS duration"
    );
    expect(SESSIONS_CTE).toContain("project_id = {projectId:String}");
    expect(SESSIONS_CTE).toContain(
      "event_date BETWEEN {from:Date} AND {to:Date}"
    );
  });
});

describe("buildSessionsHistogramQuery", () => {
  it("buckets durations and counts sessions per bucket", () => {
    const { query, params } = buildSessionsHistogramQuery(input);
    expect(query).toContain("WITH sessions AS");
    expect(query).toContain("'30m+') AS bucket");
    expect(query).toContain("FROM sessions");
    expect(query).toContain("GROUP BY bucket, sort");
    expect(query).toContain("ORDER BY sort");
    expect(params).toEqual(input);
  });
});

describe("buildSessionsTrendQuery", () => {
  it("averages duration per day", () => {
    const { query, params } = buildSessionsTrendQuery(input);
    expect(query).toContain("toUInt64(round(avg(duration))) AS avg_seconds");
    expect(query).toContain("GROUP BY event_date");
    expect(query).toContain("ORDER BY event_date");
    expect(params).toEqual(input);
  });
});

describe("buildSessionsHeatmapQuery", () => {
  it("counts sessions by weekday and hour of start", () => {
    const { query, params } = buildSessionsHeatmapQuery(input);
    expect(query).toContain("toUInt8(toDayOfWeek(started_at)) AS weekday");
    expect(query).toContain("toUInt8(toHour(started_at))      AS hour");
    expect(query).toContain("GROUP BY weekday, hour");
    expect(params).toEqual(input);
  });
});
