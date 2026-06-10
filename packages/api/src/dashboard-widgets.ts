import { z } from "zod";

import { queryConfigSchema } from "./query-builder";

export const widgetSizeSchema = z.enum(["Third", "Half", "TwoThirds", "Full"]);

export const BUILTIN_WIDGET_TYPES = [
  "metric.events",
  "metric.players",
  "metric.sessions",
  "chart.events-per-day",
  "list.events-by-type",
] as const;

export const CUSTOM_WIDGET_TYPE = "custom.stat";

/** A widget that renders a saved Metric (referenced by id, not embedded). */
export const METRIC_WIDGET_TYPE = "metric.saved";

const MAX_CARD_TITLE_LENGTH = 80;

/**
 * Built-in widgets carry no config beyond an optional project binding. On the
 * org overview, a present `projectId` pins the widget to one project; absent
 * means the widget aggregates org-wide. On the project overview it is ignored.
 */
export const builtinWidgetConfigSchema = z.object({
  projectId: z.string().min(1).optional(),
});

/**
 * Custom stat widgets store a user-defined query. `projectId` and `timeRange`
 * are never persisted — they are injected at render time from the widget
 * binding and the dashboard's global time range.
 */
export const customWidgetConfigSchema = z
  .object({
    display: z.enum(["metric", "timeseries"]),
    projectId: z.string().min(1).optional(),
    query: queryConfigSchema.omit({ projectId: true, timeRange: true }),
    title: z.string().min(1).max(MAX_CARD_TITLE_LENGTH),
  })
  .superRefine((config, ctx) => {
    if (config.display === "metric" && config.query.granularity !== "none") {
      ctx.addIssue({
        code: "custom",
        message: 'Metric display requires granularity "none"',
        path: ["query", "granularity"],
      });
    }
    if (
      config.display === "timeseries" &&
      config.query.granularity === "none"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Timeseries display requires a time granularity",
        path: ["query", "granularity"],
      });
    }
  });

/**
 * Metric widgets reference a saved Metric; the query lives on the Metric row.
 * `projectId` follows the same pinning rules as built-in widgets.
 */
export const metricWidgetConfigSchema = z.object({
  metricId: z.string().min(1),
  projectId: z.string().min(1).optional(),
});

export const widgetSchema = z.discriminatedUnion("widgetType", [
  z.object({
    config: builtinWidgetConfigSchema,
    id: z.string().min(1).optional(),
    size: widgetSizeSchema,
    widgetType: z.enum(BUILTIN_WIDGET_TYPES),
  }),
  z.object({
    config: customWidgetConfigSchema,
    id: z.string().min(1).optional(),
    size: widgetSizeSchema,
    widgetType: z.literal(CUSTOM_WIDGET_TYPE),
  }),
  z.object({
    config: metricWidgetConfigSchema,
    id: z.string().min(1).optional(),
    size: widgetSizeSchema,
    widgetType: z.literal(METRIC_WIDGET_TYPE),
  }),
]);

export type DashboardWidgetInput = z.infer<typeof widgetSchema>;
export type BuiltinWidgetType = (typeof BUILTIN_WIDGET_TYPES)[number];
export type DashboardWidgetType =
  | BuiltinWidgetType
  | typeof CUSTOM_WIDGET_TYPE
  | typeof METRIC_WIDGET_TYPE;
export type WidgetSizeValue = z.infer<typeof widgetSizeSchema>;
export type BuiltinWidgetConfig = z.infer<typeof builtinWidgetConfigSchema>;
export type CustomWidgetConfig = z.infer<typeof customWidgetConfigSchema>;
export type MetricWidgetConfig = z.infer<typeof metricWidgetConfigSchema>;

export interface DashboardWidgetSnapshot {
  widgetType: string;
  config: unknown;
  id: string;
  position: number;
  size: WidgetSizeValue;
}

const buildDefaultWidgets = (prefix: string): DashboardWidgetSnapshot[] => [
  {
    config: {},
    id: `${prefix}-metric-events`,
    position: 0,
    size: "Third",
    widgetType: "metric.events",
  },
  {
    config: {},
    id: `${prefix}-metric-players`,
    position: 1,
    size: "Third",
    widgetType: "metric.players",
  },
  {
    config: {},
    id: `${prefix}-metric-sessions`,
    position: 2,
    size: "Third",
    widgetType: "metric.sessions",
  },
  {
    config: {},
    id: `${prefix}-chart-events-per-day`,
    position: 3,
    size: "Full",
    widgetType: "chart.events-per-day",
  },
  {
    config: {},
    id: `${prefix}-list-events-by-type`,
    position: 4,
    size: "Full",
    widgetType: "list.events-by-type",
  },
];

/** Rendered in-memory when no Dashboard row exists; mirrors today's overview. */
export const DEFAULT_PROJECT_OVERVIEW = buildDefaultWidgets("default-project");
export const DEFAULT_ORG_OVERVIEW = buildDefaultWidgets("default-org");
