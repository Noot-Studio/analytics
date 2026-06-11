import { describe, expect, it } from "bun:test";

import {
  compileMetricExpression,
  parseMetricExpression,
  serializeFilter,
  validateMetricExpression,
} from "./metric-expression";

describe("compileMetricExpression", () => {
  it("compiles a two-event ratio into conditional counts with a zero guard", () => {
    const { valueExpr, params } = compileMetricExpression(
      'count({event_type="purchase"}) / count({event_type="add_cart"}) * 100'
    );

    expect(valueExpr).toBe(
      "((countIf(event_type = {filter_0_value:String}) / nullIf(countIf(event_type = {filter_1_value:String}), 0)) * 100)"
    );
    expect(params.filter_0_value).toBe("purchase");
    expect(params.filter_1_value).toBe("add_cart");
  });

  it("counts every row when a selector has no matchers", () => {
    const { valueExpr } = compileMetricExpression(
      'count({event_type="kill"}) / count() * 100'
    );

    expect(valueExpr).toBe(
      "((countIf(event_type = {filter_0_value:String}) / nullIf(count(), 0)) * 100)"
    );
  });

  it("maps unique aggregations to uniqIf over the identity column", () => {
    const { valueExpr } = compileMetricExpression(
      'uniq_players({scene="dust2"}) / uniq_players()'
    );

    expect(valueExpr).toBe(
      "(uniqIf(player_id, scene = {filter_0_value:String}) / nullIf(uniq(player_id), 0))"
    );
  });

  it("reads a property aggregation out of the JSON blob", () => {
    const { valueExpr, params } = compileMetricExpression(
      'avg(fps{event_type="frame"})'
    );

    expect(valueExpr).toBe(
      "avgIf(JSONExtractFloat(properties, {prop_fps_name:String}), event_type = {filter_0_value:String})"
    );
    expect(params.prop_fps_name).toBe("fps");
    expect(params.filter_0_value).toBe("frame");
  });

  it("honours arithmetic precedence and parentheses", () => {
    const { valueExpr } = compileMetricExpression("count() + count() * 2");
    expect(valueExpr).toBe("(count() + (count() * 2))");

    const { valueExpr: grouped } = compileMetricExpression(
      "(count() + count()) * 2"
    );
    expect(grouped).toBe("((count() + count()) * 2)");
  });

  it("supports != matchers via neq", () => {
    const { valueExpr } = compileMetricExpression('count({scene!="lobby"})');
    expect(valueExpr).toBe("countIf(scene != {filter_0_value:String})");
  });

  it("compiles the full matcher operator set", () => {
    const { valueExpr, params } = compileMetricExpression(
      'count({weapon =~ "ak", fps > 60, scene in ("a","b"), team is not empty})'
    );

    expect(valueExpr).toContain("LIKE {filter_0_value:String}");
    expect(valueExpr).toContain("> {filter_1_value:Float64}");
    expect(valueExpr).toContain("IN (");
    expect(valueExpr).toContain("notEmpty(");
    expect(params.filter_0_value).toBe("%ak%");
    expect(params.filter_1_value).toBe(60);
  });
});

describe("serializeFilter", () => {
  const cases: {
    filter: Parameters<typeof serializeFilter>[0];
    text: string;
  }[] = [
    {
      filter: { operator: "eq", property: "scene", value: "x" },
      text: 'scene = "x"',
    },
    {
      filter: { operator: "neq", property: "scene", value: "x" },
      text: 'scene != "x"',
    },
    {
      filter: { operator: "contains", property: "w", value: "ak" },
      text: 'w =~ "ak"',
    },
    {
      filter: { operator: "not_contains", property: "w", value: "ak" },
      text: 'w !~ "ak"',
    },
    {
      filter: { operator: "starts_with", property: "w", value: "ak" },
      text: 'w ^= "ak"',
    },
    {
      filter: { operator: "gt", property: "fps", value: 60 },
      text: "fps > 60",
    },
    {
      filter: { operator: "lte", property: "fps", value: 30 },
      text: "fps <= 30",
    },
    {
      filter: { operator: "in", property: "scene", value: ["a", "b"] },
      text: 'scene in ("a", "b")',
    },
    {
      filter: { operator: "is_empty", property: "team", value: "" },
      text: "team is empty",
    },
    {
      filter: { operator: "is_not_empty", property: "team", value: "" },
      text: "team is not empty",
    },
    {
      filter: { operator: "eq", property: "odd key", value: "x" },
      text: '"odd key" = "x"',
    },
  ];

  it("round-trips every operator back through the parser", () => {
    for (const { filter, text } of cases) {
      expect(serializeFilter(filter)).toBe(text);
      const ast = parseMetricExpression(`count({${text}})`);
      expect(ast.type).toBe("agg");
      if (ast.type === "agg") {
        expect(ast.matchers[0]).toEqual(filter);
      }
    }
  });
});

describe("validateMetricExpression", () => {
  it("returns null for a valid expression", () => {
    expect(
      validateMetricExpression('count({event_type="a"}) / count()')
    ).toBeNull();
  });

  it("rejects an unknown function", () => {
    expect(validateMetricExpression("median()")).toContain("Unknown function");
  });

  it("rejects a property aggregation without a property", () => {
    expect(validateMetricExpression("avg()")).toContain("needs a property");
  });

  it("rejects an unbalanced expression", () => {
    expect(validateMetricExpression("count(")).not.toBeNull();
    expect(validateMetricExpression("count() +")).not.toBeNull();
    expect(validateMetricExpression('count({event_type="a")')).not.toBeNull();
  });
});

describe("parseMetricExpression", () => {
  it("throws on trailing tokens", () => {
    expect(() => parseMetricExpression("count() count()")).toThrow();
  });
});
