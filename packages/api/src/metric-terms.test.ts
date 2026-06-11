import { describe, expect, it } from "bun:test";

import { decodeFormula, encodeFormula } from "./metric-terms";
import type { MetricFormula } from "./metric-terms";

describe("encodeFormula", () => {
  it("renders a single term without an operator", () => {
    expect(
      encodeFormula({
        operators: [],
        terms: [
          { aggregation: "count", filters: [], kind: "agg", property: "" },
        ],
      })
    ).toBe("count()");
  });

  it("joins two terms with their gap operator", () => {
    expect(
      encodeFormula({
        operators: ["/"],
        terms: [
          {
            aggregation: "count",
            filters: [{ operator: "eq", property: "event_type", value: "buy" }],
            kind: "agg",
            property: "",
          },
          { aggregation: "count", filters: [], kind: "agg", property: "" },
        ],
      })
    ).toBe('count({event_type = "buy"}) / count()');
  });

  it("left-nests three terms and renders a raw number", () => {
    expect(
      encodeFormula({
        operators: ["/", "*"],
        terms: [
          { aggregation: "count", filters: [], kind: "agg", property: "" },
          {
            aggregation: "uniq_players",
            filters: [],
            kind: "agg",
            property: "",
          },
          { kind: "number", value: 100 },
        ],
      })
    ).toBe("(count() / uniq_players()) * 100");
  });

  it("renders a property aggregation", () => {
    expect(
      encodeFormula({
        operators: [],
        terms: [
          { aggregation: "avg", filters: [], kind: "agg", property: "fps" },
        ],
      })
    ).toBe("avg(fps)");
  });
});

describe("decodeFormula", () => {
  it("decodes a single aggregation", () => {
    expect(decodeFormula('count({event_type="kill"})')).toEqual({
      operators: [],
      terms: [
        {
          aggregation: "count",
          filters: [{ operator: "eq", property: "event_type", value: "kill" }],
          kind: "agg",
          property: "",
        },
      ],
    });
  });

  it("decodes a left-nested percentage as three terms", () => {
    const formula = decodeFormula("(count() / uniq_players()) * 100");
    expect(formula?.operators).toEqual(["/", "*"]);
    expect(formula?.terms).toHaveLength(3);
    expect(formula?.terms[2]).toEqual({ kind: "number", value: 100 });
  });

  it("decodes a left-nested chain of mixed operators", () => {
    const formula = decodeFormula("(count() + count()) / count()");
    expect(formula?.operators).toEqual(["+", "/"]);
    expect(formula?.terms).toHaveLength(3);
  });

  it("returns null for right-nested precedence (too complex)", () => {
    expect(decodeFormula("count() + count() * count()")).toBeNull();
  });

  it("returns null for invalid syntax", () => {
    expect(decodeFormula("count(")).toBeNull();
  });
});

describe("formula round-trip", () => {
  const formulas: MetricFormula[] = [
    {
      operators: [],
      terms: [{ aggregation: "count", filters: [], kind: "agg", property: "" }],
    },
    {
      operators: ["/", "*"],
      terms: [
        {
          aggregation: "count",
          filters: [{ operator: "eq", property: "event_type", value: "buy" }],
          kind: "agg",
          property: "",
        },
        {
          aggregation: "uniq_sessions",
          filters: [{ operator: "gt", property: "fps", value: 30 }],
          kind: "agg",
          property: "",
        },
        { kind: "number", value: 100 },
      ],
    },
    {
      operators: ["+", "-"],
      terms: [
        { aggregation: "sum", filters: [], kind: "agg", property: "score" },
        { aggregation: "sum", filters: [], kind: "agg", property: "bonus" },
        { aggregation: "sum", filters: [], kind: "agg", property: "penalty" },
      ],
    },
  ];

  it("survives encode -> decode unchanged", () => {
    for (const formula of formulas) {
      expect(decodeFormula(encodeFormula(formula))).toEqual(formula);
    }
  });
});
