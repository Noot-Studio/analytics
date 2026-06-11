import { describe, expect, it } from "bun:test";

import { widgetConfigSchema } from "./widgets";

describe("widgetConfigSchema", () => {
  it("accepts a compatible config and drops metricId", () => {
    const result = widgetConfigSchema.safeParse({
      granularity: "none",
      metricId: "metric_1",
      visualization: "number",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("metricId");
    }
  });

  it("still enforces shape/visualization compatibility after the omit", () => {
    const result = widgetConfigSchema.safeParse({
      granularity: "none",
      visualization: "area",
    });
    expect(result.success).toBe(false);
  });
});
