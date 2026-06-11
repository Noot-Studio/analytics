import { describe, expect, it } from "bun:test";

import {
  BUILTIN_WIDGET_TYPES,
  widgetSchema,
  customWidgetConfigSchema,
  DEFAULT_ORG_OVERVIEW,
  DEFAULT_PROJECT_OVERVIEW,
  metricWidgetConfigSchema,
} from "./dashboard-widgets";

const validCustomQuery = {
  aggregation: "count",
  granularity: "none",
  limit: 100,
} as const;

describe("widgetSchema", () => {
  it("accepts every built-in widget type with an empty config", () => {
    for (const widgetType of BUILTIN_WIDGET_TYPES) {
      const result = widgetSchema.safeParse({
        config: {},
        size: "Third",
        widgetType,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts a built-in widget pinned to a project", () => {
    const result = widgetSchema.safeParse({
      config: { projectId: "proj_1" },
      size: "Half",
      widgetType: "metric.events",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown widget type", () => {
    const result = widgetSchema.safeParse({
      config: {},
      size: "Full",
      widgetType: "metric.unknown",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid size", () => {
    const result = widgetSchema.safeParse({
      config: {},
      size: "Quarter",
      widgetType: "metric.events",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid custom metric widget", () => {
    const result = widgetSchema.safeParse({
      config: {
        display: "metric",
        query: validCustomQuery,
        title: "Kills",
      },
      size: "Third",
      widgetType: "custom.stat",
    });
    expect(result.success).toBe(true);
  });
});

describe("customWidgetConfigSchema", () => {
  it("strips projectId and timeRange from the stored query", () => {
    const result = customWidgetConfigSchema.safeParse({
      display: "metric",
      query: {
        ...validCustomQuery,
        projectId: "proj_1",
        timeRange: { from: "2026-01-01T00:00:00Z", to: "2026-01-02T00:00:00Z" },
      },
      title: "Kills",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).not.toHaveProperty("projectId");
      expect(result.data.query).not.toHaveProperty("timeRange");
    }
  });

  it("rejects metric display with a time granularity", () => {
    const result = customWidgetConfigSchema.safeParse({
      display: "metric",
      query: { ...validCustomQuery, granularity: "day" },
      title: "Kills",
    });
    expect(result.success).toBe(false);
  });

  it("rejects timeseries display without a time granularity", () => {
    const result = customWidgetConfigSchema.safeParse({
      display: "timeseries",
      query: { ...validCustomQuery, granularity: "none" },
      title: "Kills over time",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty title", () => {
    const result = customWidgetConfigSchema.safeParse({
      display: "metric",
      query: validCustomQuery,
      title: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("metricWidgetConfigSchema", () => {
  it("accepts a scalar metric drawn as a number", () => {
    const result = metricWidgetConfigSchema.safeParse({
      granularity: "none",
      metricId: "metric_1",
      visualization: "number",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a series metric drawn as an area chart", () => {
    const result = metricWidgetConfigSchema.safeParse({
      granularity: "day",
      metricId: "metric_1",
      visualization: "area",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a scalar metric drawn as an area chart", () => {
    const result = metricWidgetConfigSchema.safeParse({
      granularity: "none",
      metricId: "metric_1",
      visualization: "area",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a series metric drawn as a number", () => {
    const result = metricWidgetConfigSchema.safeParse({
      granularity: "day",
      metricId: "metric_1",
      visualization: "number",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an incompatible pairing through the widget union", () => {
    const result = widgetSchema.safeParse({
      config: {
        granularity: "none",
        metricId: "metric_1",
        visualization: "area",
      },
      size: "Third",
      widgetType: "metric.saved",
    });
    expect(result.success).toBe(false);
  });
});

describe("default layouts", () => {
  it("every default widget validates against widgetSchema", () => {
    for (const widget of [
      ...DEFAULT_PROJECT_OVERVIEW,
      ...DEFAULT_ORG_OVERVIEW,
    ]) {
      const result = widgetSchema.safeParse({
        config: widget.config,
        id: widget.id,
        size: widget.size,
        widgetType: widget.widgetType,
      });
      expect(result.success).toBe(true);
    }
  });

  it("default widgets have contiguous positions starting at 0", () => {
    const positions = DEFAULT_PROJECT_OVERVIEW.map((widget) => widget.position);
    expect(positions).toEqual([0, 1, 2, 3, 4]);
  });
});
