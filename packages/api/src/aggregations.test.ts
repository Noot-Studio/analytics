import { describe, expect, it } from "bun:test";

import { aggregationRequiresProperty, emitAggregation } from "./aggregations";

describe("emitAggregation", () => {
  it("emits count over rows, with and without a predicate", () => {
    expect(emitAggregation("count", {})).toBe("count()");
    expect(emitAggregation("count", { predicate: "x = 1" })).toBe(
      "countIf(x = 1)"
    );
  });

  it("emits uniq over the identity column for unique aggregations", () => {
    expect(emitAggregation("uniq_players", {})).toBe("uniq(player_id)");
    expect(emitAggregation("uniq_sessions", { predicate: "x = 1" })).toBe(
      "uniqIf(session_id, x = 1)"
    );
  });

  it("wraps the supplied accessor for property aggregations", () => {
    expect(emitAggregation("avg", { accessor: "fps" })).toBe("avg(fps)");
    expect(
      emitAggregation("sum", { accessor: "fps", predicate: "x = 1" })
    ).toBe("sumIf(fps, x = 1)");
  });

  it("throws when a property aggregation has no accessor", () => {
    expect(() => emitAggregation("min", {})).toThrow("min() needs a property");
  });
});

describe("aggregationRequiresProperty", () => {
  it("flags only the property aggregations", () => {
    expect(aggregationRequiresProperty("avg")).toBe(true);
    expect(aggregationRequiresProperty("sum")).toBe(true);
    expect(aggregationRequiresProperty("min")).toBe(true);
    expect(aggregationRequiresProperty("max")).toBe(true);
    expect(aggregationRequiresProperty("count")).toBe(false);
    expect(aggregationRequiresProperty("uniq_players")).toBe(false);
    expect(aggregationRequiresProperty("uniq_sessions")).toBe(false);
  });
});
