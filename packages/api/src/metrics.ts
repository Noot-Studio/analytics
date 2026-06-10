import { z } from "zod";

import { queryConfigSchema } from "./query-builder";

const MAX_METRIC_NAME_LENGTH = 80;
const MAX_METRIC_DESCRIPTION_LENGTH = 500;

/**
 * A metric stores the query-config DSL without execution context: `projectId`
 * and `timeRange` are supplied by the consumer (dashboard binding + global
 * time range, or an alert's evaluation window).
 */
export const metricConfigSchema = queryConfigSchema.omit({
  projectId: true,
  timeRange: true,
});

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
 * The shape of a metric's result set — determined entirely by the query
 * config, never by how a widget chooses to draw it.
 */
export type MetricResultShape =
  | "grouped-series"
  | "groups"
  | "scalar"
  | "series";

export const resultShape = (config: MetricConfig): MetricResultShape => {
  const hasSeries = config.granularity !== "none";
  const hasGroups = (config.groupBy?.length ?? 0) > 0;
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

export const defaultVisualization = (config: MetricConfig): Visualization => {
  const [first] = compatibleVisualizations(resultShape(config));
  return first ?? "table";
};
