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

export type MetricDisplay = "metric" | "table" | "timeseries";

/** How a metric's result set renders: shape is fully determined by the DSL. */
export const metricDisplay = (config: MetricConfig): MetricDisplay => {
  if (config.granularity !== "none") {
    return "timeseries";
  }
  if (config.groupBy && config.groupBy.length > 0) {
    return "table";
  }
  return "metric";
};
