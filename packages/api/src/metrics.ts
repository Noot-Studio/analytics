import { z } from "zod";

import { queryConfigSchema, withMetricConfigRules } from "./query-builder";

const MAX_METRIC_NAME_LENGTH = 80;
const MAX_METRIC_DESCRIPTION_LENGTH = 500;

/**
 * A metric is *what* to measure — an aggregation/expression over a selector —
 * and nothing about *how* to fetch or draw it. Execution context (`projectId`,
 * `timeRange`) and shape (`granularity`, `groupBy`, `limit`) are supplied by the
 * consumer: a widget, an alert window, or the builder preview. This is what lets
 * one metric be reused across widgets and alerts. The rules enforce that exactly
 * one of `aggregation` / `expression` is set.
 */
export const metricConfigSchema = withMetricConfigRules(
  queryConfigSchema.omit({
    granularity: true,
    groupBy: true,
    limit: true,
    projectId: true,
    timeRange: true,
  })
);

/**
 * The shape/execution half a consumer pairs with a metric to fetch data. Lives
 * on the widget (or alert), not the metric, so the same metric draws as a
 * number, a daily series, or a grouped table depending on who runs it.
 */
export const metricViewSchema = queryConfigSchema.pick({
  granularity: true,
  groupBy: true,
  limit: true,
});

export type MetricView = z.infer<typeof metricViewSchema>;
/** Just the fields that determine result shape (granularity + group-by). */
export type ShapeParams = Pick<MetricView, "granularity" | "groupBy">;

export const metricInputSchema = z.object({
  config: metricConfigSchema,
  description: z.string().max(MAX_METRIC_DESCRIPTION_LENGTH).optional(),
  name: z.string().min(1).max(MAX_METRIC_NAME_LENGTH),
});

export type MetricConfig = z.infer<typeof metricConfigSchema>;
export type MetricInput = z.infer<typeof metricInputSchema>;

export interface MetricSnapshot {
  config: MetricConfig;
  description: string | null;
  id: string;
  name: string;
  updatedAt: string;
}

/**
 * The shape of a result set — determined by the view params (granularity +
 * group-by) the consumer runs the metric with, never by how it's drawn.
 */
export type MetricResultShape =
  | "grouped-series"
  | "groups"
  | "scalar"
  | "series";

export const resultShape = (view: ShapeParams): MetricResultShape => {
  const hasSeries = view.granularity !== "none";
  const hasGroups = (view.groupBy?.length ?? 0) > 0;
  if (hasSeries && hasGroups) {
    return "grouped-series";
  }
  if (hasSeries) {
    return "series";
  }
  if (hasGroups) {
    return "groups";
  }
  return "scalar";
};

export const visualizationSchema = z.enum(["number", "area", "bar", "table"]);
export type Visualization = z.infer<typeof visualizationSchema>;

/** Visualizations a result shape can render; first entry is the default. */
export const compatibleVisualizations = (
  shape: MetricResultShape
): Visualization[] => {
  switch (shape) {
    case "scalar": {
      return ["number"];
    }
    case "series": {
      return ["area", "bar", "table"];
    }
    case "groups": {
      return ["table", "bar"];
    }
    case "grouped-series": {
      return ["table"];
    }
    default: {
      return ["table"];
    }
  }
};

export const defaultVisualization = (view: ShapeParams): Visualization => {
  const [first] = compatibleVisualizations(resultShape(view));
  return first ?? "table";
};
