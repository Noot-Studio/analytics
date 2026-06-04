import type {
  CustomCardConfig,
  DashboardCardInput,
} from "@sbox-analytics/api/dashboard-cards";
import { customCardConfigSchema } from "@sbox-analytics/api/dashboard-cards";
import { Button } from "@sbox-analytics/ui/components/button";
import { Input } from "@sbox-analytics/ui/components/input";
import { Label } from "@sbox-analytics/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";

import { orpc } from "@/utils/orpc";

import { CardErrorBoundary } from "../atoms/card-error-boundary";
import { CustomStatCard } from "./custom-stat-card";

// Select label maps (the `items` prop renders labels instead of raw values).
const AGGREGATION_ITEMS = {
  avg: "Average of property",
  count: "Event count",
  max: "Maximum of property",
  min: "Minimum of property",
  sum: "Sum of property",
  unique_players: "Unique players",
  unique_sessions: "Unique sessions",
} as const;

const GRANULARITY_ITEMS = {
  day: "Daily",
  hour: "Hourly",
  month: "Monthly",
  week: "Weekly",
} as const;

const DISPLAY_ITEMS = {
  metric: "Single number",
  timeseries: "Chart over time",
} as const;

const PROPERTY_AGGREGATIONS = new Set(["avg", "max", "min", "sum"]);
const QUERY_LIMIT = 1000;
const ALL_EVENTS = "__all__";

type Aggregation = keyof typeof AGGREGATION_ITEMS;
type TimeseriesGranularity = keyof typeof GRANULARITY_ITEMS;

interface CustomCardFormProps {
  from: string;
  onAdd: (card: DashboardCardInput) => void;
  /** Resolved project the card queries (dashboard project or org pin). */
  projectId?: string;
  to: string;
}

export const CustomCardForm = ({
  from,
  onAdd,
  projectId,
  to,
}: CustomCardFormProps) => {
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

  const handleSubmit = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!parsed.success) {
      return;
    }
    onAdd({
      cardType: "custom.stat",
      config,
      size: display === "timeseries" ? "Full" : "Third",
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="custom-card-title">Title</Label>
        <Input
          id="custom-card-title"
          maxLength={80}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Knife kills"
          value={title}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="custom-card-event">Event</Label>
        <Select
          items={eventItems}
          onValueChange={(value) => value && setEventType(value)}
          value={eventType}
        >
          <SelectTrigger className="w-full" id="custom-card-event">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(eventItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="custom-card-aggregation">Statistic</Label>
        <Select
          items={AGGREGATION_ITEMS}
          onValueChange={(value) =>
            value && setAggregation(value as Aggregation)
          }
          value={aggregation}
        >
          <SelectTrigger className="w-full" id="custom-card-aggregation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(AGGREGATION_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsProperty ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-card-property">Property</Label>
          {propertyKeys && propertyKeys.length > 0 ? (
            <Select
              onValueChange={(value) => value && setAggregateProperty(value)}
              value={aggregateProperty}
            >
              <SelectTrigger className="w-full" id="custom-card-property">
                <SelectValue placeholder="Pick a property…" />
              </SelectTrigger>
              <SelectContent>
                {propertyKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="custom-card-property"
              onChange={(event) => setAggregateProperty(event.target.value)}
              placeholder="e.g. fps"
              value={aggregateProperty}
            />
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="custom-card-display">Display</Label>
        <Select
          items={DISPLAY_ITEMS}
          onValueChange={(value) =>
            value && setDisplay(value as "metric" | "timeseries")
          }
          value={display}
        >
          <SelectTrigger className="w-full" id="custom-card-display">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DISPLAY_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {display === "timeseries" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-card-granularity">Granularity</Label>
          <Select
            items={GRANULARITY_ITEMS}
            onValueChange={(value) =>
              value && setGranularity(value as TimeseriesGranularity)
            }
            value={granularity}
          >
            <SelectTrigger className="w-full" id="custom-card-granularity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(GRANULARITY_ITEMS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {parsed.success ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-muted-foreground text-xs">
            Preview
          </span>
          <div className="pointer-events-none select-none">
            <CardErrorBoundary>
              <Suspense fallback={<Skeleton className="h-24 w-full" />}>
                <CustomStatCard
                  config={parsed.data satisfies CustomCardConfig}
                  from={from}
                  projectId={projectId}
                  to={to}
                />
              </Suspense>
            </CardErrorBoundary>
          </div>
        </div>
      ) : null}

      <Button className="self-end" disabled={!parsed.success} type="submit">
        Add card
      </Button>
    </form>
  );
};
