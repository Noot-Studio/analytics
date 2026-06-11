import { z } from "zod";

import {
  metricWidgetConfigBase,
  refineWidgetVisualization,
} from "./dashboard-widgets";

const MAX_WIDGET_NAME_LENGTH = 80;

/**
 * A saved Widget pairs a Metric (the *what*) with everything about *how* to
 * fetch and draw it. The config is exactly a metric-widget config minus the
 * metric reference, which lives in its own column so deleting a metric
 * cascades to its widgets.
 */
export const widgetConfigSchema = metricWidgetConfigBase
  .omit({ metricId: true })
  .superRefine(refineWidgetVisualization);

export const widgetInputSchema = z.object({
  config: widgetConfigSchema,
  metricId: z.string().min(1),
  name: z.string().min(1).max(MAX_WIDGET_NAME_LENGTH),
});

export type WidgetConfig = z.infer<typeof widgetConfigSchema>;
export type WidgetInput = z.infer<typeof widgetInputSchema>;

export interface WidgetSnapshot {
  config: WidgetConfig;
  id: string;
  metricId: string;
  name: string;
  updatedAt: string;
}
