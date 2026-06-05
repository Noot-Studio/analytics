import { customCardConfigSchema } from "@sbox-analytics/api/dashboard-cards";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

// Select label maps (the `items` prop renders labels instead of raw values).
export const AGGREGATION_ITEMS = {
  avg: "Average of property",
  count: "Event count",
  max: "Maximum of property",
  min: "Minimum of property",
  sum: "Sum of property",
  unique_players: "Unique players",
  unique_sessions: "Unique sessions",
} as const;

export const GRANULARITY_ITEMS = {
  day: "Daily",
  hour: "Hourly",
  month: "Monthly",
  week: "Weekly",
} as const;

export const DISPLAY_ITEMS = {
  metric: "Single number",
  timeseries: "Chart over time",
} as const;

const PROPERTY_AGGREGATIONS = new Set(["avg", "max", "min", "sum"]);
const QUERY_LIMIT = 1000;
const ALL_EVENTS = "__all__";

export type Aggregation = keyof typeof AGGREGATION_ITEMS;
export type TimeseriesGranularity = keyof typeof GRANULARITY_ITEMS;

/**
 * Owns the custom-card builder state: the form fields, the introspection
 * queries that populate event/property pickers, config assembly, and Zod
 * validation. The component is left as pure JSX over what this returns.
 */
export const useCustomCardForm = (projectId?: string) => {
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState(ALL_EVENTS);
  const [aggregation, setAggregation] = useState<Aggregation>("count");
  const [aggregateProperty, setAggregateProperty] = useState("");
  const [display, setDisplay] = useState<"metric" | "timeseries">("metric");
  const [granularity, setGranularity] = useState<TimeseriesGranularity>("day");

  const { data: eventTypes } = useQuery(
    orpc.introspection.eventTypes.queryOptions({
      enabled: Boolean(projectId),
      input: { projectId: projectId ?? "" },
    })
  );

  const eventItems: Record<string, string> = {
    [ALL_EVENTS]: "All events",
    ...Object.fromEntries((eventTypes ?? []).map((type) => [type, type])),
  };

  const needsProperty = PROPERTY_AGGREGATIONS.has(aggregation);
  const hasEventType = eventType !== ALL_EVENTS;
  const { data: propertyKeys } = useQuery(
    orpc.introspection.propertyKeys.queryOptions({
      enabled: Boolean(projectId) && hasEventType && needsProperty,
      input: { eventType, projectId: projectId ?? "" },
    })
  );

  const config = {
    display,
    projectId,
    query: {
      aggregateProperty: needsProperty ? aggregateProperty : undefined,
      aggregation,
      eventType: hasEventType ? eventType : undefined,
      granularity: display === "metric" ? ("none" as const) : granularity,
      limit: QUERY_LIMIT,
    },
    title: title.trim(),
  };
  const parsed = customCardConfigSchema.safeParse(config);

  return {
    aggregateProperty,
    aggregation,
    config,
    display,
    eventItems,
    eventType,
    granularity,
    needsProperty,
    parsed,
    propertyKeys,
    setAggregateProperty,
    setAggregation,
    setDisplay,
    setEventType,
    setGranularity,
    setTitle,
    title,
  };
};
