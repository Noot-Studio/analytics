import type { MetricConfig } from "@sbox-analytics/api/metrics";
import { metricConfigSchema } from "@sbox-analytics/api/metrics";
import type { Filter } from "@sbox-analytics/api/query-builder";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

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
  none: "Whole period",
  week: "Weekly",
} as const;

export const OPERATOR_ITEMS = {
  contains: "contains",
  eq: "equals",
  gt: ">",
  gte: ">=",
  in: "is one of",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  lt: "<",
  lte: "<=",
  neq: "does not equal",
  not_contains: "does not contain",
  starts_with: "starts with",
} as const;

const PROPERTY_AGGREGATIONS = new Set(["avg", "max", "min", "sum"]);
const QUERY_LIMIT = 1000;
const ALL_EVENTS = "__all__";
const MAX_FILTERS = 10;

export type Aggregation = keyof typeof AGGREGATION_ITEMS;
export type Granularity = keyof typeof GRANULARITY_ITEMS;
export type FilterOperator = keyof typeof OPERATOR_ITEMS;

/** Operators whose bound value compares numerically in the query builder. */
const ORDERING_OPERATORS = new Set<FilterOperator>(["gt", "gte", "lt", "lte"]);
/** Operators that take no value input. */
export const VALUELESS_OPERATORS = new Set<FilterOperator>([
  "is_empty",
  "is_not_empty",
]);

export interface FilterDraft {
  id: string;
  operator: FilterOperator;
  property: string;
  value: string;
}

let filterDraftCounter = 0;
const nextFilterId = (): string => {
  filterDraftCounter += 1;
  return `filter-${filterDraftCounter}`;
};

const toFilter = (draft: FilterDraft): Filter => {
  if (VALUELESS_OPERATORS.has(draft.operator)) {
    return { operator: draft.operator, property: draft.property, value: "" };
  }
  if (draft.operator === "in") {
    return {
      operator: draft.operator,
      property: draft.property,
      value: draft.value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    };
  }
  if (ORDERING_OPERATORS.has(draft.operator)) {
    return {
      operator: draft.operator,
      property: draft.property,
      value: Number(draft.value),
    };
  }
  return {
    operator: draft.operator,
    property: draft.property,
    value: draft.value,
  };
};

const toFilterDraft = (filter: Filter): FilterDraft => ({
  id: nextFilterId(),
  operator: filter.operator,
  property: filter.property,
  value: Array.isArray(filter.value)
    ? filter.value.join(", ")
    : String(filter.value),
});

/**
 * Owns the metric builder state: form fields, introspection queries that
 * populate event/property pickers, config assembly, and Zod validation. The
 * raw JSON tab round-trips through `config` / `applyConfig`, so both editors
 * share one source of truth.
 */
export const useMetricBuilder = (projectId?: string) => {
  const formId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState(ALL_EVENTS);
  const [aggregation, setAggregation] = useState<Aggregation>("count");
  const [aggregateProperty, setAggregateProperty] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("none");
  const [filters, setFilters] = useState<FilterDraft[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);

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
      enabled: Boolean(projectId) && hasEventType,
      input: { eventType, projectId: projectId ?? "" },
    })
  );

  const config = {
    aggregateProperty: needsProperty
      ? aggregateProperty || undefined
      : undefined,
    aggregation,
    eventType: hasEventType ? eventType : undefined,
    filters: filters.length > 0 ? filters.map(toFilter) : undefined,
    granularity,
    groupBy: groupBy.length > 0 ? groupBy : undefined,
    limit: QUERY_LIMIT,
  };
  const parsed = metricConfigSchema.safeParse(config);

  /** Hydrate every form field from a config (raw-JSON tab applies edits here). */
  const applyConfig = (next: MetricConfig) => {
    setAggregation(next.aggregation);
    setAggregateProperty(next.aggregateProperty ?? "");
    setEventType(next.eventType ?? ALL_EVENTS);
    setGranularity(next.granularity);
    setFilters((next.filters ?? []).map(toFilterDraft));
    setGroupBy(next.groupBy ?? []);
  };

  const addFilter = () => {
    if (filters.length >= MAX_FILTERS) {
      return;
    }
    setFilters([
      ...filters,
      { id: nextFilterId(), operator: "eq", property: "", value: "" },
    ]);
  };

  const updateFilter = (id: string, patch: Partial<FilterDraft>) => {
    setFilters(
      filters.map((filter) =>
        filter.id === id ? { ...filter, ...patch } : filter
      )
    );
  };

  const removeFilter = (id: string) => {
    setFilters(filters.filter((filter) => filter.id !== id));
  };

  return {
    addFilter,
    aggregateProperty,
    aggregation,
    applyConfig,
    config,
    description,
    eventItems,
    eventType,
    filters,
    formId,
    granularity,
    groupBy,
    name,
    needsProperty,
    parsed,
    propertyKeys,
    removeFilter,
    setAggregateProperty,
    setAggregation,
    setDescription,
    setEventType,
    setGranularity,
    setGroupBy,
    setName,
    updateFilter,
  };
};
