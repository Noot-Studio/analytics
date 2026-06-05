import type {
  CustomCardConfig,
  DashboardCardInput,
} from "@sbox-analytics/api/dashboard-cards";
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
import { Suspense } from "react";

import { CUSTOM_CARD_TYPE, customCardSize } from "../../lib/card-registry";
import type {
  Aggregation,
  TimeseriesGranularity,
} from "../../lib/use-custom-card-form";
import {
  AGGREGATION_ITEMS,
  DISPLAY_ITEMS,
  GRANULARITY_ITEMS,
  useCustomCardForm,
} from "../../lib/use-custom-card-form";
import { CardErrorBoundary } from "../atoms/card-error-boundary";
import { CustomStatCard } from "./custom-stat-card";

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
  const form = useCustomCardForm(projectId);
  const { config, parsed } = form;

  const handleSubmit = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!parsed.success) {
      return;
    }
    onAdd({
      cardType: CUSTOM_CARD_TYPE,
      config,
      size: customCardSize(parsed.data),
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="custom-card-title">Title</Label>
        <Input
          id="custom-card-title"
          maxLength={80}
          onChange={(event) => form.setTitle(event.target.value)}
          placeholder="e.g. Knife kills"
          value={form.title}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="custom-card-event">Event</Label>
        <Select
          items={form.eventItems}
          onValueChange={(value) => value && form.setEventType(value)}
          value={form.eventType}
        >
          <SelectTrigger className="w-full" id="custom-card-event">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(form.eventItems).map(([value, label]) => (
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
            value && form.setAggregation(value as Aggregation)
          }
          value={form.aggregation}
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

      {form.needsProperty ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-card-property">Property</Label>
          {form.propertyKeys && form.propertyKeys.length > 0 ? (
            <Select
              onValueChange={(value) =>
                value && form.setAggregateProperty(value)
              }
              value={form.aggregateProperty}
            >
              <SelectTrigger className="w-full" id="custom-card-property">
                <SelectValue placeholder="Pick a property…" />
              </SelectTrigger>
              <SelectContent>
                {form.propertyKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="custom-card-property"
              onChange={(event) =>
                form.setAggregateProperty(event.target.value)
              }
              placeholder="e.g. fps"
              value={form.aggregateProperty}
            />
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="custom-card-display">Display</Label>
        <Select
          items={DISPLAY_ITEMS}
          onValueChange={(value) =>
            value && form.setDisplay(value as "metric" | "timeseries")
          }
          value={form.display}
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

      {form.display === "timeseries" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-card-granularity">Granularity</Label>
          <Select
            items={GRANULARITY_ITEMS}
            onValueChange={(value) =>
              value && form.setGranularity(value as TimeseriesGranularity)
            }
            value={form.granularity}
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
