import { describe, expect, it } from "bun:test";

import {
  buildRetentionCurveQuery,
  buildRetentionTableCountQuery,
  buildRetentionTableQuery,
} from "./retention";
import type { RetentionInput } from "./retention";

const base: RetentionInput = {
  from: "2026-05-01",
  joinOperator: "and",
  page: 1,
  perPage: 10,
  projectId: "proj_1",
  sortDesc: true,
  to: "2026-06-01",
};

describe("buildRetentionTableQuery", () => {
  it("builds the cohort CTE and paginates, default sort cohort_date DESC", () => {
    const { query, params } = buildRetentionTableQuery(base);
    expect(query).toContain("WITH cohorts AS");
    expect(query).toContain("FROM analytics.player_first_seen");
    expect(query).toContain("INNER JOIN activity AS a USING (player_id)");
    expect(query).toContain("uniqExactIf(player_id, day_offset = 0)) AS size");
    expect(query).toContain("ORDER BY cohort_date DESC");
    expect(query).toContain("LIMIT {perPage:UInt32} OFFSET {offset:UInt32}");
    // The cohorts CTE always carries a HAVING; with no filters there is no
    // second, filter-derived HAVING before the ORDER BY.
    expect(params).not.toHaveProperty("filter_0_value");
    expect(params).toMatchObject({
      from: "2026-05-01",
      offset: 0,
      perPage: 10,
      projectId: "proj_1",
      to: "2026-06-01",
    });
  });

  it("maps page -> offset and honours sortBy + ascending", () => {
    const { query, params } = buildRetentionTableQuery({
      ...base,
      page: 4,
      perPage: 20,
      sortBy: "d7",
      sortDesc: false,
    });
    expect(query).toContain("ORDER BY d7 ASC");
    expect(params.offset).toBe(60);
    expect(params.perPage).toBe(20);
  });

  it("adds a HAVING clause + bound param for cohort-alias filters", () => {
    const { query, params } = buildRetentionTableQuery({
      ...base,
      filters: [{ operator: "gte", property: "size", value: 50 }],
    });
    expect(query).toContain("HAVING (size >= {filter_0_value:Float64})");
    expect(params.filter_0_value).toBe(50);
  });

  it("drops filters whose property is not an allowed cohort column", () => {
    const { params } = buildRetentionTableQuery({
      ...base,
      filters: [{ operator: "eq", property: "not_a_column", value: "x" }],
    });
    expect(params).not.toHaveProperty("filter_0_value");
  });
});

describe("buildRetentionTableCountQuery", () => {
  it("wraps the cohort select in a count() subquery", () => {
    const { query, params } = buildRetentionTableCountQuery(base);
    expect(query).toContain("SELECT count() AS total FROM (");
    expect(query).toContain("WITH cohorts AS");
    expect(params).not.toHaveProperty("filter_0_value");
    expect(params).toEqual({
      from: "2026-05-01",
      projectId: "proj_1",
      to: "2026-06-01",
    });
  });

  it("mirrors the same HAVING filter so the total matches the page", () => {
    const { query, params } = buildRetentionTableCountQuery({
      ...base,
      filters: [{ operator: "gte", property: "d1", value: 20 }],
    });
    expect(query).toContain("HAVING (d1 >= {filter_0_value:Float64})");
    expect(params.filter_0_value).toBe(20);
  });
});

describe("buildRetentionCurveQuery", () => {
  it("aggregates retained players per day_offset over mature cohorts", () => {
    const { query, params } = buildRetentionCurveQuery(base);
    expect(query).toContain("WITH cohorts AS");
    expect(query).toContain("toUInt64(uniqExact(player_id)) AS retained");
    expect(query).toContain("WHERE cohort_date <= {to:Date} - 30");
    expect(query).toContain("GROUP BY day_offset");
    expect(query).toContain("ORDER BY day_offset");
    expect(params).toEqual({
      from: "2026-05-01",
      projectId: "proj_1",
      to: "2026-06-01",
    });
  });
});
