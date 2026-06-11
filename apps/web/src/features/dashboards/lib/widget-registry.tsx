import type {
  WidgetSizeValue,
  DashboardWidgetType,
} from "@sbox-analytics/api/dashboard-widgets";
import {
  CUSTOM_WIDGET_TYPE,
  METRIC_WIDGET_TYPE,
} from "@sbox-analytics/api/dashboard-widgets";
import type { Visualization } from "@sbox-analytics/api/metrics";
import type { ComponentType } from "react";

import {
  EventsByTypeWidget,
  EventsPerDayWidget,
  MetricEventsWidget,
  MetricPlayersWidget,
  MetricSessionsWidget,
} from "../components/molecules/builtin-widgets";
import { CustomStatWidget } from "../components/molecules/custom-stat-widget";
import { SavedMetricWidget } from "../components/molecules/saved-metric-widget";

export interface WidgetRendererProps {
  config: unknown;
  from: string;
  /** Set for org dashboards; scopes org-wide widgets to this organization. */
  organizationId?: string;
  /** Set for project dashboards; org widgets fall back to their config pin. */
  projectId?: string;
  to: string;
}

export interface WidgetDefinition {
  defaultSize: WidgetSizeValue;
  /** Card height (px) used when a widget hasn't been explicitly resized. */
  defaultHeight: number;
  description: string;
  Renderer: ComponentType<WidgetRendererProps>;
  title: string;
}

// Single-number stats read fine short; charts and tables need vertical room.
const STAT_HEIGHT = 150;
const CHART_HEIGHT = 320;

export const WIDGET_REGISTRY: Record<DashboardWidgetType, WidgetDefinition> = {
  "chart.events-per-day": {
    Renderer: EventsPerDayWidget,
    defaultHeight: CHART_HEIGHT,
    defaultSize: "Full",
    description: "Area chart of total events per day.",
    title: "Events per day",
  },
  "custom.stat": {
    Renderer: CustomStatWidget,
    defaultHeight: STAT_HEIGHT,
    defaultSize: "Third",
    description: "A statistic you define from your own events.",
    title: "Custom statistic",
  },
  "list.events-by-type": {
    Renderer: EventsByTypeWidget,
    defaultHeight: CHART_HEIGHT,
    defaultSize: "Full",
    description: "Event totals broken down by type.",
    title: "Events by type",
  },
  "metric.events": {
    Renderer: MetricEventsWidget,
    defaultHeight: STAT_HEIGHT,
    defaultSize: "Third",
    description: "Total events with period-over-period trend.",
    title: "Total Events",
  },
  "metric.players": {
    Renderer: MetricPlayersWidget,
    defaultHeight: STAT_HEIGHT,
    defaultSize: "Third",
    description: "Unique players summed per day, with trend.",
    title: "Unique Players",
  },
  "metric.saved": {
    Renderer: SavedMetricWidget,
    defaultHeight: STAT_HEIGHT,
    defaultSize: "Third",
    description: "A saved metric from your library.",
    title: "Saved metric",
  },
  "metric.sessions": {
    Renderer: MetricSessionsWidget,
    defaultHeight: STAT_HEIGHT,
    defaultSize: "Third",
    description: "Sessions summed per day, with trend.",
    title: "Sessions",
  },
};

export const getWidgetDefinition = (
  widgetType: string
): WidgetDefinition | undefined =>
  Object.hasOwn(WIDGET_REGISTRY, widgetType)
    ? WIDGET_REGISTRY[widgetType as DashboardWidgetType]
    : undefined;

export { CUSTOM_WIDGET_TYPE, METRIC_WIDGET_TYPE };

/** Charts and tables fill a row; a single number takes a third. */
export const metricWidgetSize = (
  visualization: Visualization
): WidgetSizeValue => (visualization === "number" ? "Third" : "Full");
