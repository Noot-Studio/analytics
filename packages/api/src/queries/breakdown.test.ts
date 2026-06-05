import { describe, expect, it } from "bun:test";

import { buildBreakdownQuery } from "./breakdown";
import type { BreakdownInput } from "./breakdown";

const base: BreakdownInput = {
  from: "2026-05-01",
  joinOperator: "and",
  projectId: "proj_1",
  sortBy: "event_count",
  sortDesc: true,
  to: "2026-06-01",
};

describe("buildBreakdownQuery", () => {
  it("groups by event_type over the daily rollup, default sort", () => {
    const { query, params } = buildBreakdownQuery(base);
    expect(query).toContain("FROM analytics.events_daily");
    expect(query).toContain("project_id = {projectId:String}");
    expect(query).toContain("event_date BETWEEN {from:Date} AND {to:Date}");
    expect(query).toContain("GROUP BY event_type");
    expect(query).toContain("ORDER BY event_count DESC");
    expect(query).not.toContain("HAVING");
    expect(params).toEqual({
      from: "2026-05-01",
      projectId: "proj_1",
      to: "2026-06-01",
    });
  });

  it("respects sortBy + ascending direction", () => {
    const { query } = buildBreakdownQuery({
      ...base,
      sortBy: "unique_players",
      sortDesc: false,
    });
    expect(query).toContain("ORDER BY unique_players ASC");
  });

  it("emits a HAVING clause + bound param when filters are present", () => {
    const { query, params } = buildBreakdownQuery({
      ...base,
      filters: [{ operator: "gt", property: "event_count", value: 100 }],
    });
    expect(query).toContain("HAVING");
    expect(query).toContain("event_count > {filter_0_value:Float64}");
    expect(params.filter_0_value).toBe(100);
  });

  it("drops filters whose property is not an allowed column", () => {
    const { query } = buildBreakdownQuery({
      ...base,
      filters: [{ operator: "eq", property: "not_a_column", value: "x" }],
    });
    expect(query).not.toContain("HAVING");
  });
});
