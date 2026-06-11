import { z } from "zod";

import { visualizationSchema } from "./metrics";
import { queryConfigSchema } from "./query-builder";

export const widgetSizeSchema = z.enum(["Third", "Half", "TwoThirds", "Full"]);

// Grid layout in react-grid-layout units on a 12-column grid. Optional so a
// widget can be created from its `size`; once placed/resized the client sends
// explicit coordinates. Minimums keep widgets readable.
export const GRID_COLUMNS = 12;
export const WIDGET_MIN_W = 2;
export const WIDGET_MIN_H = 2;
export const widgetLayoutSchema = z.object({
  h: z.number().int().min(WIDGET_MIN_H).max(100),
  w: z.number().int().min(WIDGET_MIN_W).max(GRID_COLUMNS),
  x: z.number().int().min(0).max(GRID_COLUMNS),
  y: z.number().int().min(0),
});

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
 * Metric widgets reference a saved Metric (the *what*) and own everything about
 * *how* to fetch and draw it: `granularity` / `groupBy` / `limit` shape the
 * result, and `visualization` must be compatible with that shape (enforced at
 * save time). The same metric can therefore sit on several dashboards as a
 * number, a daily chart, or a grouped table. `projectId` follows the same
 * pinning rules as built-in widgets.
 */
export const metricWidgetConfigSchema = queryConfigSchema
  .pick({ granularity: true, groupBy: true, limit: true })
  .extend({
    metricId: z.string().min(1),
    projectId: z.string().min(1).optional(),
    visualization: visualizationSchema,
  });

export const widgetSchema = z.discriminatedUnion("widgetType", [
  z.object({
    config: builtinWidgetConfigSchema,
    id: z.string().min(1).optional(),
    layout: widgetLayoutSchema.optional(),
    size: widgetSizeSchema,
    widgetType: z.enum(BUILTIN_WIDGET_TYPES),
  }),
  z.object({
    config: customWidgetConfigSchema,
    id: z.string().min(1).optional(),
    layout: widgetLayoutSchema.optional(),
    size: widgetSizeSchema,
    widgetType: z.literal(CUSTOM_WIDGET_TYPE),
  }),
  z.object({
    config: metricWidgetConfigSchema,
    id: z.string().min(1).optional(),
    layout: widgetLayoutSchema.optional(),
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

export type WidgetLayout = z.infer<typeof widgetLayoutSchema>;

export interface DashboardWidgetSnapshot {
  widgetType: string;
  config: unknown;
  id: string;
  position: number;
  size: WidgetSizeValue;
  layout?: WidgetLayout;
}

const buildDefaultWidgets = (prefix: string): DashboardWidgetSnapshot[] => [
  {
    config: {},
    id: `${prefix}-metric-events`,
    layout: { h: 4, w: 4, x: 0, y: 0 },
    position: 0,
    size: "Third",
    widgetType: "metric.events",
  },
  {
    config: {},
    id: `${prefix}-metric-players`,
    layout: { h: 4, w: 4, x: 4, y: 0 },
    position: 1,
    size: "Third",
    widgetType: "metric.players",
  },
  {
    config: {},
    id: `${prefix}-metric-sessions`,
    layout: { h: 4, w: 4, x: 8, y: 0 },
    position: 2,
    size: "Third",
    widgetType: "metric.sessions",
  },
  {
    config: {},
    id: `${prefix}-chart-events-per-day`,
    layout: { h: 10, w: 12, x: 0, y: 4 },
    position: 3,
    size: "Full",
    widgetType: "chart.events-per-day",
  },
  {
    config: {},
    id: `${prefix}-list-events-by-type`,
    layout: { h: 10, w: 12, x: 0, y: 14 },
    position: 4,
    size: "Full",
    widgetType: "list.events-by-type",
  },
];

/** Rendered in-memory when no Dashboard row exists; mirrors today's overview. */
export const DEFAULT_PROJECT_OVERVIEW = buildDefaultWidgets("default-project");
export const DEFAULT_ORG_OVERVIEW = buildDefaultWidgets("default-org");
