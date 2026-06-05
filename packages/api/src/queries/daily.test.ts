import { describe, expect, it } from "bun:test";

import { buildDailyQuery } from "./daily";

describe("buildDailyQuery", () => {
  it("aggregates the daily rollup over the project + date window", () => {
    const { query, params } = buildDailyQuery({
      from: "2026-05-01",
      projectId: "proj_1",
      to: "2026-06-01",
    });
    expect(query).toContain("FROM analytics.events_daily");
    expect(query).toContain("project_id = {projectId:String}");
    expect(query).toContain("event_date BETWEEN {from:Date} AND {to:Date}");
    expect(query).toContain("GROUP BY event_date, event_type");
    expect(query).toContain("ORDER BY event_date, event_type");
    expect(params).toEqual({
      from: "2026-05-01",
      projectId: "proj_1",
      to: "2026-06-01",
    });
  });
});
