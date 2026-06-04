import { describe, expect, it } from "bun:test";

import type { ColumnFilterDef } from "./query-builder";
import {
  applyFilters,
  buildColumnFilters,
  buildQuery,
  queryConfigSchema,
} from "./query-builder";

describe("buildQuery", () => {
  it("normalizes ISO time-range bounds for ClickHouse DateTime64 params", () => {
    const config = queryConfigSchema.parse({
      aggregation: "count",
      granularity: "none",
      projectId: "p1",
      timeRange: {
        from: "2026-05-28T00:00:00.000Z",
        to: "2026-06-04T23:59:59.999Z",
      },
    });

    const { params } = buildQuery(config);

    // ClickHouse rejects the trailing Z / T separator in DateTime64(3) params.
    expect(params.from).toBe("2026-05-28 00:00:00.000");
    expect(params.to).toBe("2026-06-04 23:59:59.999");
  });

  it("omits ORDER BY for an ungrouped aggregate (single-row result)", () => {
    const config = queryConfigSchema.parse({
      aggregation: "count",
      granularity: "none",
      projectId: "p1",
      timeRange: {
        from: "2026-05-28T00:00:00.000Z",
        to: "2026-06-04T23:59:59.999Z",
      },
    });

    const { query } = buildQuery(config);

    expect(query).not.toContain("ORDER BY");
    expect(query).not.toContain("GROUP BY");
  });

  it("orders grouped queries by their group columns", () => {
    const config = queryConfigSchema.parse({
      aggregation: "count",
      granularity: "day",
      projectId: "p1",
      timeRange: {
        from: "2026-05-28T00:00:00.000Z",
        to: "2026-06-04T23:59:59.999Z",
      },
    });

    const { query } = buildQuery(config);

    expect(query).toContain("GROUP BY time_bucket");
    expect(query).toContain("ORDER BY time_bucket");
  });
});

describe("applyFilters", () => {
  it("references a known top-level column directly (no JSONExtract)", () => {
    const params: Record<string, unknown> = {};
    const conditions = applyFilters(
      [{ operator: "eq", property: "event_type", value: "kill" }],
      params
    );

    expect(conditions).toEqual(["event_type = {filter_0_value:String}"]);
    expect(conditions[0]).not.toContain("JSONExtract");
    expect(params.filter_0_value).toBe("kill");
  });

  it("builds a not-equal condition for a known column", () => {
    const params: Record<string, unknown> = {};
    const conditions = applyFilters(
      [{ operator: "neq", property: "player_id", value: "p1" }],
      params
    );

    expect(conditions[0]).toBe("player_id != {filter_0_value:String}");
    expect(params.filter_0_value).toBe("p1");
  });

  it("expands an `in` filter into one placeholder per value", () => {
    const params: Record<string, unknown> = {};
    const conditions = applyFilters(
      [{ operator: "in", property: "scene", value: ["a", "b"] }],
      params
    );

    expect(conditions[0]).toContain("scene IN (");
    expect(params.filter_0_value_0).toBe("a");
    expect(params.filter_0_value_1).toBe("b");
  });

  it("reads an unknown property out of the JSON blob and wraps `contains`", () => {
    const params: Record<string, unknown> = {};
    const conditions = applyFilters(
      [{ operator: "contains", property: "weapon", value: "ak" }],
      params
    );

    expect(conditions[0]).toContain(
      "JSONExtractString(properties, {prop_weapon_name:String})"
    );
    expect(conditions[0]).toContain("LIKE {filter_0_value:String}");
    expect(params.filter_0_value).toBe("%ak%");
    expect(params.prop_weapon_name).toBe("weapon");
  });

  it("offsets generated param names by startIndex", () => {
    const params: Record<string, unknown> = {};
    const conditions = applyFilters(
      [{ operator: "eq", property: "event_type", value: "kill" }],
      params,
      3
    );

    expect(conditions[0]).toBe("event_type = {filter_3_value:String}");
    expect(params.filter_3_value).toBe("kill");
  });

  it("returns no conditions for empty or missing filters", () => {
    expect(applyFilters(undefined, {})).toEqual([]);
    expect(applyFilters([], {})).toEqual([]);
  });

  it("negates a `contains` filter with NOT LIKE", () => {
    const params: Record<string, unknown> = {};
    const conditions = applyFilters(
      [{ operator: "not_contains", property: "scene", value: "ak" }],
      params
    );

    expect(conditions[0]).toContain("NOT LIKE {filter_0_value:String}");
    expect(params.filter_0_value).toBe("%ak%");
  });

  it("builds empty/non-empty checks without binding a value param", () => {
    const params: Record<string, unknown> = {};
    const conditions = applyFilters(
      [
        { operator: "is_empty", property: "player_id", value: "" },
        { operator: "is_not_empty", property: "session_id", value: "" },
      ],
      params
    );

    expect(conditions).toEqual(["empty(player_id)", "notEmpty(session_id)"]);
    expect(params.filter_0_value).toBeUndefined();
    expect(params.filter_1_value).toBeUndefined();
  });

  it("emits one condition per filter with distinct param indices", () => {
    const params: Record<string, unknown> = {};
    const conditions = applyFilters(
      [
        { operator: "eq", property: "event_type", value: "kill" },
        { operator: "eq", property: "player_id", value: "p1" },
      ],
      params
    );

    expect(conditions).toHaveLength(2);
    expect(params.filter_0_value).toBe("kill");
    expect(params.filter_1_value).toBe("p1");
  });
});

describe("buildColumnFilters", () => {
  const COLUMNS: Record<string, ColumnFilterDef> = {
    avg_fps: { expr: "avg_fps", type: "number" },
    map: { expr: "map", type: "string" },
  };

  it("returns null for empty or missing filters", () => {
    expect(buildColumnFilters(undefined, COLUMNS, {})).toBeNull();
    expect(buildColumnFilters([], COLUMNS, {})).toBeNull();
  });

  it("references the aggregate alias directly without JSONExtract", () => {
    const params: Record<string, unknown> = {};
    const having = buildColumnFilters(
      [{ operator: "gt", property: "avg_fps", value: 60 }],
      COLUMNS,
      params
    );

    expect(having).toBe("(avg_fps > {filter_0_value:Float64})");
    expect(having).not.toContain("JSONExtract");
    expect(params.filter_0_value).toBe(60);
  });

  it("binds a string column with a String param and wraps `contains`", () => {
    const params: Record<string, unknown> = {};
    const having = buildColumnFilters(
      [{ operator: "contains", property: "map", value: "dust" }],
      COLUMNS,
      params
    );

    expect(having).toBe("(map LIKE {filter_0_value:String})");
    expect(params.filter_0_value).toBe("%dust%");
  });

  it("joins multiple conditions with AND by default", () => {
    const having = buildColumnFilters(
      [
        { operator: "gt", property: "avg_fps", value: 30 },
        { operator: "contains", property: "map", value: "de" },
      ],
      COLUMNS,
      {}
    );

    expect(having).toBe(
      "(avg_fps > {filter_0_value:Float64} AND map LIKE {filter_1_value:String})"
    );
  });

  it("joins with OR when requested", () => {
    const having = buildColumnFilters(
      [
        { operator: "gt", property: "avg_fps", value: 30 },
        { operator: "lt", property: "avg_fps", value: 10 },
      ],
      COLUMNS,
      {},
      "or"
    );

    expect(having).toBe(
      "(avg_fps > {filter_0_value:Float64} OR avg_fps < {filter_1_value:Float64})"
    );
  });

  it("checks a string column for emptiness without a bound param", () => {
    const params: Record<string, unknown> = {};
    const having = buildColumnFilters(
      [{ operator: "is_empty", property: "map", value: "" }],
      COLUMNS,
      params
    );

    expect(having).toBe("(empty(map))");
    expect(params.filter_0_value).toBeUndefined();
  });

  it("negates a string column match with NOT LIKE", () => {
    const params: Record<string, unknown> = {};
    const having = buildColumnFilters(
      [{ operator: "not_contains", property: "map", value: "de" }],
      COLUMNS,
      params
    );

    expect(having).toBe("(map NOT LIKE {filter_0_value:String})");
    expect(params.filter_0_value).toBe("%de%");
  });

  it("drops filters whose property is not in the allowlist", () => {
    const params: Record<string, unknown> = {};
    const having = buildColumnFilters(
      [
        { operator: "eq", property: "secret_col", value: "x" },
        { operator: "eq", property: "map", value: "office" },
      ],
      COLUMNS,
      params
    );

    expect(having).toBe("(map = {filter_1_value:String})");
    expect(params.filter_0_value).toBeUndefined();
    expect(params.filter_1_value).toBe("office");
  });
});
