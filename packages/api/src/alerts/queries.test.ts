import { describe, expect, it } from "bun:test";

import { buildCrashCountQuery, buildDauWindowQuery } from "./queries";

describe("buildCrashCountQuery", () => {
  it("counts crash events across the scope since the window start", () => {
    const { query, params } = buildCrashCountQuery({
      projectIds: ["proj_1", "proj_2"],
      since: "2026-06-11T10:00:00.000Z",
    });
    expect(query).toContain("FROM analytics.events");
    expect(query).toContain("event_type = 'crash'");
    expect(query).toContain("project_id IN {projectIds:Array(String)}");
    expect(query).toContain(
      "timestamp >= parseDateTimeBestEffort({since:String})"
    );
    expect(params).toEqual({
      projectIds: ["proj_1", "proj_2"],
      since: "2026-06-11T10:00:00.000Z",
    });
  });
});

describe("buildDauWindowQuery", () => {
  it("reads current and baseline DAU from the daily rollup", () => {
    const { query, params } = buildDauWindowQuery({
      baselineFrom: "2026-06-04",
      projectIds: ["proj_1"],
      today: "2026-06-11",
    });
    expect(query).toContain("FROM analytics.events_daily");
    expect(query).toContain("uniqMerge(unique_players)");
    expect(query).toContain("sumIf(daily, d = {today:Date})");
    expect(query).toContain("avgIf(daily, d < {today:Date})");
    expect(query).toContain(
      "event_date BETWEEN {baselineFrom:Date} AND {today:Date}"
    );
    expect(params).toEqual({
      baselineFrom: "2026-06-04",
      projectIds: ["proj_1"],
      today: "2026-06-11",
    });
  });
});
