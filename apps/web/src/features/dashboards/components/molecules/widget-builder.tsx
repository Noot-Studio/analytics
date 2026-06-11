import type {
  MetricSnapshot,
  Visualization,
} from "@sbox-analytics/api/metrics";
import {
  compatibleVisualizations,
  defaultVisualization,
  resultShape,
} from "@sbox-analytics/api/metrics";
import type { WidgetInput } from "@sbox-analytics/api/widgets";
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
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { orpc } from "@/utils/orpc";

type Granularity = "none" | "hour" | "day" | "week" | "month";

const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: "Per day",
  hour: "Per hour",
  month: "Per month",
  none: "Total (no time bucket)",
  week: "Per week",
};

const VISUALIZATION_LABELS: Record<Visualization, string> = {
  area: "Area chart",
  bar: "Bar chart",
  number: "Number",
  table: "Table",
};

const DEFAULT_LIMIT = 100;

interface WidgetBuilderProps {
  isSaving: boolean;
  onCreateMetric: () => void;
  onSave: (input: WidgetInput) => void;
  organizationId?: string;
  projectId?: string;
  /** Renders the live preview for the current settings. */
  renderPreview: (config: {
    granularity: Granularity;
    limit: number;
    metricId: string;
    visualization: Visualization;
  }) => ReactNode;
  /** Metric to preselect, e.g. one just created from this flow. */
  selectedMetricId?: string;
  onSelectMetric: (metricId: string) => void;
}

/**
 * The widget creation form: pick a metric (or jump to creating one), then
 * choose how the widget fetches and draws it, with a live preview. Saving is
 * owned by the caller so the drawer can both persist the widget and place it.
 */
export const WidgetBuilder = ({
  isSaving,
  onCreateMetric,
  onSave,
  organizationId,
  projectId,
  renderPreview,
  selectedMetricId,
  onSelectMetric,
}: WidgetBuilderProps) => {
  const [name, setName] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("none");
  const [visualization, setVisualization] = useState<Visualization>("number");

  const { data: metrics } = useQuery(
    orpc.metrics.list.queryOptions({ input: { organizationId, projectId } })
  );

  const metricItems = Object.fromEntries(
    (metrics ?? []).map((metric) => [metric.id, metric.name])
  );
  const selectedMetric: MetricSnapshot | undefined = (metrics ?? []).find(
    (metric) => metric.id === selectedMetricId
  );

  const visualizations = compatibleVisualizations(resultShape({ granularity }));
  const visualizationItems = Object.fromEntries(
    visualizations.map((option) => [option, VISUALIZATION_LABELS[option]])
  );

  const handleGranularityChange = (value: string) => {
    const next = value as Granularity;
    setGranularity(next);
    if (
      !compatibleVisualizations(resultShape({ granularity: next })).includes(
        visualization
      )
    ) {
      setVisualization(defaultVisualization({ granularity: next }));
    }
  };

  const effectiveName = name.trim() || (selectedMetric?.name ?? "");
  const canSave = Boolean(selectedMetricId) && effectiveName !== "";

  const handleSave = () => {
    if (!(selectedMetricId && canSave)) {
      return;
    }
    onSave({
      config: { granularity, limit: DEFAULT_LIMIT, visualization },
      metricId: selectedMetricId,
      name: effectiveName,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="widget-metric">Metric</Label>
        <div className="flex items-center gap-2">
          <Select
            items={metricItems}
            onValueChange={(value) => value && onSelectMetric(value)}
            value={selectedMetricId ?? ""}
          >
            <SelectTrigger className="flex-1" id="widget-metric">
              <SelectValue placeholder="Pick a metric" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(metricItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={onCreateMetric} variant="outline">
            <Plus />
            New metric
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="widget-name">Title</Label>
        <Input
          id="widget-name"
          onChange={(event) => setName(event.target.value)}
          placeholder={selectedMetric?.name ?? "Widget title"}
          value={name}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="widget-granularity">Granularity</Label>
        <Select
          items={GRANULARITY_LABELS}
          onValueChange={(value) => value && handleGranularityChange(value)}
          value={granularity}
        >
          <SelectTrigger className="w-full" id="widget-granularity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(GRANULARITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="widget-visualization">Visualization</Label>
        <Select
          items={visualizationItems}
          onValueChange={(value) =>
            value && setVisualization(value as Visualization)
          }
          value={visualization}
        >
          <SelectTrigger className="w-full" id="widget-visualization">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(visualizationItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedMetricId ? (
        <div className="flex flex-col gap-1.5">
          <Label>Preview</Label>
          {renderPreview({
            granularity,
            limit: DEFAULT_LIMIT,
            metricId: selectedMetricId,
            visualization,
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
          Pick a metric to preview the widget.
        </p>
      )}

      <Button disabled={!canSave || isSaving} onClick={handleSave}>
        {isSaving ? "Saving…" : "Save widget & add"}
      </Button>
    </div>
  );
};
