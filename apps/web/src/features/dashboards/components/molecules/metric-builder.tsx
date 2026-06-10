import type { MetricConfig, MetricInput } from "@sbox-analytics/api/metrics";
import { metricConfigSchema } from "@sbox-analytics/api/metrics";
import { Badge } from "@sbox-analytics/ui/components/badge";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@sbox-analytics/ui/components/tabs";
import { Textarea } from "@sbox-analytics/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { orpc } from "@/utils/orpc";

import type {
  Aggregation,
  FilterOperator,
  Granularity,
} from "../../lib/use-metric-builder";
import {
  AGGREGATION_ITEMS,
  GRANULARITY_ITEMS,
  OPERATOR_ITEMS,
  useMetricBuilder,
  VALUELESS_OPERATORS,
} from "../../lib/use-metric-builder";
import { MetricResult } from "./metric-result";

interface MetricBuilderProps {
  from: string;
  isSaving: boolean;
  onSave: (metric: MetricInput) => void;
  /** Resolved project the preview queries (dashboard project or org pin). */
  projectId?: string;
  to: string;
}

const PREVIEW_DEBOUNCE_MS = 500;

/** Top-level event columns offered alongside sampled property keys. */
const COLUMN_SUGGESTIONS = ["event_type", "player_id", "scene", "session_id"];

const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};

const formatZodError = (error: {
  issues: { message: string; path: PropertyKey[] }[];
}): string =>
  error.issues
    .map((issue) =>
      issue.path.length > 0
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message
    )
    .join("\n");

export const MetricBuilder = ({
  from,
  isSaving,
  onSave,
  projectId,
  to,
}: MetricBuilderProps) => {
  const builder = useMetricBuilder(projectId);
  const { formId, parsed } = builder;

  const [rawText, setRawText] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);
  const [groupByInput, setGroupByInput] = useState("");

  const propertySuggestions = [
    ...COLUMN_SUGGESTIONS,
    ...(builder.propertyKeys ?? []),
  ];
  const groupByCandidates = propertySuggestions.filter(
    (property) => !builder.groupBy.includes(property)
  );

  // Tab switch to JSON serializes current state; edits flow back via apply.
  const handleTabChange = (tab: unknown) => {
    if (tab === "json") {
      setRawText(JSON.stringify(builder.config, null, 2));
      setRawError(null);
    }
  };

  const handleRawChange = (text: string) => {
    setRawText(text);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      setRawError("Invalid JSON");
      return;
    }
    const result = metricConfigSchema.safeParse(value);
    if (!result.success) {
      setRawError(formatZodError(result.error));
      return;
    }
    setRawError(null);
    builder.applyConfig(result.data);
  };

  // Preview re-runs only after the (valid) config settles for a moment.
  const configKey = useDebouncedValue(
    parsed.success ? JSON.stringify(parsed.data) : null,
    PREVIEW_DEBOUNCE_MS
  );
  const { data: preview, isFetching: isPreviewFetching } = useQuery(
    orpc.metrics.preview.queryOptions({
      enabled: Boolean(projectId) && configKey !== null,
      input: {
        config: (configKey ? JSON.parse(configKey) : {}) as MetricConfig,
        projectId: projectId ?? "",
        timeRange: { from, to },
      },
    })
  );

  const canSave = parsed.success && builder.name.trim().length > 0 && !isSaving;

  const handleSubmit = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!(parsed.success && canSave)) {
      return;
    }
    onSave({
      config: parsed.data,
      description: builder.description.trim() || undefined,
      name: builder.name.trim(),
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-name`}>Name</Label>
        <Input
          id={`${formId}-name`}
          maxLength={80}
          onChange={(event) => builder.setName(event.target.value)}
          placeholder="e.g. Knife kills"
          value={builder.name}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-description`}>Description (optional)</Label>
        <Input
          id={`${formId}-description`}
          maxLength={500}
          onChange={(event) => builder.setDescription(event.target.value)}
          placeholder="What this metric measures"
          value={builder.description}
        />
      </div>

      <Tabs defaultValue="builder" onValueChange={handleTabChange}>
        <TabsList className="w-full">
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent className="flex flex-col gap-4" value="builder">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-event`}>Event</Label>
            <Select
              items={builder.eventItems}
              onValueChange={(value) => value && builder.setEventType(value)}
              value={builder.eventType}
            >
              <SelectTrigger className="w-full" id={`${formId}-event`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(builder.eventItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-aggregation`}>Statistic</Label>
            <Select
              items={AGGREGATION_ITEMS}
              onValueChange={(value) =>
                value && builder.setAggregation(value as Aggregation)
              }
              value={builder.aggregation}
            >
              <SelectTrigger className="w-full" id={`${formId}-aggregation`}>
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

          {builder.needsProperty ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${formId}-property`}>Property</Label>
              <Input
                id={`${formId}-property`}
                list={`${formId}-property-keys`}
                onChange={(event) =>
                  builder.setAggregateProperty(event.target.value)
                }
                placeholder="e.g. fps"
                value={builder.aggregateProperty}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-sm">Filters</span>
            {builder.filters.map((filter) => (
              <div className="flex items-center gap-2" key={filter.id}>
                <Input
                  aria-label="Filter property"
                  className="flex-1"
                  list={`${formId}-property-keys`}
                  onChange={(event) =>
                    builder.updateFilter(filter.id, {
                      property: event.target.value,
                    })
                  }
                  placeholder="property"
                  value={filter.property}
                />
                <Select
                  items={OPERATOR_ITEMS}
                  onValueChange={(value) =>
                    value &&
                    builder.updateFilter(filter.id, {
                      operator: value as FilterOperator,
                    })
                  }
                  value={filter.operator}
                >
                  <SelectTrigger
                    aria-label="Filter operator"
                    className="w-36 shrink-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OPERATOR_ITEMS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {VALUELESS_OPERATORS.has(filter.operator) ? null : (
                  <Input
                    aria-label="Filter value"
                    className="flex-1"
                    onChange={(event) =>
                      builder.updateFilter(filter.id, {
                        value: event.target.value,
                      })
                    }
                    placeholder={filter.operator === "in" ? "a, b, c" : "value"}
                    value={filter.value}
                  />
                )}
                <Button
                  aria-label="Remove filter"
                  onClick={() => builder.removeFilter(filter.id)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <X />
                </Button>
              </div>
            ))}
            <Button
              className="self-start"
              onClick={builder.addFilter}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus />
              Add filter
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-group-by`}>Group by</Label>
            {builder.groupBy.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {builder.groupBy.map((property) => (
                  <Badge key={property} variant="secondary">
                    {property}
                    <button
                      aria-label={`Remove ${property} grouping`}
                      className="ml-1"
                      onClick={() =>
                        builder.setGroupBy(
                          builder.groupBy.filter((item) => item !== property)
                        )
                      }
                      type="button"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}
            <Input
              id={`${formId}-group-by`}
              list={`${formId}-property-keys`}
              onChange={(event) => setGroupByInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") {
                  return;
                }
                event.preventDefault();
                const property = groupByInput.trim();
                if (property && !builder.groupBy.includes(property)) {
                  builder.setGroupBy([...builder.groupBy, property]);
                  setGroupByInput("");
                }
              }}
              placeholder="Type a property and press Enter"
              value={groupByInput}
            />
            {groupByCandidates.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {groupByCandidates.slice(0, 8).map((property) => (
                  <Button
                    key={property}
                    onClick={() =>
                      builder.setGroupBy([...builder.groupBy, property])
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Plus className="size-3" />
                    {property}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-granularity`}>Granularity</Label>
            <Select
              items={GRANULARITY_ITEMS}
              onValueChange={(value) =>
                value && builder.setGranularity(value as Granularity)
              }
              value={builder.granularity}
            >
              <SelectTrigger className="w-full" id={`${formId}-granularity`}>
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
        </TabsContent>

        <TabsContent className="flex flex-col gap-1.5" value="json">
          <Label htmlFor={`${formId}-raw`}>Query config</Label>
          <Textarea
            className="min-h-56 font-mono text-xs"
            id={`${formId}-raw`}
            onChange={(event) => handleRawChange(event.target.value)}
            spellCheck={false}
            value={rawText}
          />
          {rawError ? (
            <p className="whitespace-pre-wrap text-destructive text-xs">
              {rawError}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Valid — edits apply to the builder immediately.
            </p>
          )}
        </TabsContent>
      </Tabs>

      <datalist id={`${formId}-property-keys`}>
        {propertySuggestions.map((property) => (
          <option key={property} value={property}>
            {property}
          </option>
        ))}
      </datalist>

      {projectId && parsed.success ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-medium text-muted-foreground text-xs">
            Preview
          </span>
          <div className="pointer-events-none select-none">
            {preview ? (
              <MetricResult
                config={parsed.data}
                rows={preview.rows}
                title={builder.name.trim() || "Untitled metric"}
              />
            ) : (
              <Skeleton className="h-24 w-full" />
            )}
          </div>
          {preview ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                {isPreviewFetching
                  ? "Generated SQL (refreshing…)"
                  : "Generated SQL"}
              </summary>
              <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono">
                {preview.sql}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

      <Button className="self-end" disabled={!canSave} type="submit">
        Save metric
      </Button>
    </form>
  );
};
