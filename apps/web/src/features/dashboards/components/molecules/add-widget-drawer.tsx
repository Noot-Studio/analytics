import type { DashboardWidgetInput } from "@sbox-analytics/api/dashboard-widgets";
import { BUILTIN_WIDGET_TYPES } from "@sbox-analytics/api/dashboard-widgets";
import type {
  MetricSnapshot,
  MetricView,
  Visualization,
} from "@sbox-analytics/api/metrics";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@sbox-analytics/ui/components/sheet";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useIsMobile } from "@sbox-analytics/ui/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Suspense, useState } from "react";
import type { ReactNode } from "react";

import { orpc } from "@/utils/orpc";

import type { DashboardScopeValue } from "../../lib/use-dashboard-editor";
import { useWidgetSourcePin } from "../../lib/use-widget-source-pin";
import type { WidgetDefinition } from "../../lib/widget-registry";
import {
  WIDGET_REGISTRY,
  METRIC_WIDGET_TYPE,
  metricWidgetSize,
} from "../../lib/widget-registry";
import { WidgetErrorBoundary } from "../atoms/widget-error-boundary";
import { MetricDrawer } from "./metric-drawer";

interface AddWidgetDrawerProps {
  from: string;
  onAdd: (widget: DashboardWidgetInput) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId?: string;
  projectId?: string;
  scope: DashboardScopeValue;
  to: string;
}

const VISUALIZATION_LABELS: Record<Visualization, string> = {
  area: "Area chart",
  bar: "Bar chart",
  number: "Number",
  table: "Table",
};

/** Offered in this order; a metric can be drawn any of these ways. */
const VISUALIZATION_OPTIONS: Visualization[] = [
  "number",
  "area",
  "bar",
  "table",
];

/**
 * The widget owns the shape. A "number" is a scalar (no time bucket); charts and
 * tables are a daily series. Group-by isn't exposed here yet — widgets default
 * to no breakdown.
 */
const viewForVisualization = (visualization: Visualization): MetricView => ({
  granularity: visualization === "number" ? "none" : "day",
  limit: 100,
});

const WidgetPreview = ({ children }: { children: ReactNode }) => (
  <div className="pointer-events-none select-none">
    <WidgetErrorBoundary>
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        {children}
      </Suspense>
    </WidgetErrorBoundary>
  </div>
);

interface SavedMetricEntryProps {
  from: string;
  metric: MetricSnapshot;
  onAdd: (metric: MetricSnapshot, visualization: Visualization) => void;
  organizationId?: string;
  pinnedProjectId?: string;
  projectId?: string;
  Renderer: WidgetDefinition["Renderer"];
  to: string;
}

/**
 * One library entry: the metric defines the data; the visualization picked
 * here belongs to the widget being placed, so the same metric can sit on
 * several dashboards drawn differently.
 */
const SavedMetricEntry = ({
  from,
  metric,
  onAdd,
  organizationId,
  pinnedProjectId,
  projectId,
  Renderer,
  to,
}: SavedMetricEntryProps) => {
  const [visualization, setVisualization] = useState<Visualization>("number");
  const items = Object.fromEntries(
    VISUALIZATION_OPTIONS.map((option) => [
      option,
      VISUALIZATION_LABELS[option],
    ])
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">
          {metric.description ?? "Saved metric"}
        </span>
        <div className="flex items-center gap-1">
          <Select
            items={items}
            onValueChange={(value) =>
              value && setVisualization(value as Visualization)
            }
            value={visualization}
          >
            <SelectTrigger
              aria-label={`Visualization for ${metric.name}`}
              className="h-7"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(items).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            aria-label={`Add ${metric.name}`}
            onClick={() => onAdd(metric, visualization)}
            size="icon-sm"
            variant="ghost"
          >
            <Plus />
          </Button>
        </div>
      </div>
      <WidgetPreview>
        <Renderer
          config={{
            ...viewForVisualization(visualization),
            metricId: metric.id,
            visualization,
            ...(pinnedProjectId ? { projectId: pinnedProjectId } : {}),
          }}
          from={from}
          organizationId={organizationId}
          projectId={projectId}
          to={to}
        />
      </WidgetPreview>
    </div>
  );
};

export const AddWidgetDrawer = ({
  from,
  onAdd,
  onOpenChange,
  open,
  organizationId,
  projectId,
  scope,
  to,
}: AddWidgetDrawerProps) => {
  const isMobile = useIsMobile();
  const {
    customProjectId,
    isOrgScope,
    pin,
    pinnedProjectId,
    setPin,
    sourceItems,
  } = useWidgetSourcePin({ open, projectId, scope });
  const [search, setSearch] = useState("");
  const [metricDrawerOpen, setMetricDrawerOpen] = useState(false);

  const { data: metrics } = useQuery(
    orpc.metrics.list.queryOptions({
      enabled: open,
      input: { organizationId, projectId },
    })
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch("");
      setMetricDrawerOpen(false);
    }
    onOpenChange(next);
  };

  const addBuiltin = (widgetType: (typeof BUILTIN_WIDGET_TYPES)[number]) => {
    onAdd({
      config: pinnedProjectId ? { projectId: pinnedProjectId } : {},
      size: WIDGET_REGISTRY[widgetType].defaultSize,
      widgetType,
    });
    handleOpenChange(false);
  };

  const addMetricWidget = (
    metric: MetricSnapshot,
    visualization: Visualization
  ) => {
    onAdd({
      config: {
        ...viewForVisualization(visualization),
        metricId: metric.id,
        visualization,
        ...(pinnedProjectId ? { projectId: pinnedProjectId } : {}),
      },
      size: metricWidgetSize(visualization),
      widgetType: METRIC_WIDGET_TYPE,
    });
    handleOpenChange(false);
  };

  const query = search.trim().toLowerCase();
  const matches = (...texts: (string | null | undefined)[]) =>
    query === "" || texts.some((text) => text?.toLowerCase().includes(query));

  const builtins = BUILTIN_WIDGET_TYPES.filter((widgetType) => {
    const definition = WIDGET_REGISTRY[widgetType];
    return matches(definition.title, definition.description);
  });
  const savedMetrics = (metrics ?? []).filter((metric) =>
    matches(metric.name, metric.description, "metric")
  );

  const { Renderer: MetricRenderer } = WIDGET_REGISTRY[METRIC_WIDGET_TYPE];

  return (
    <>
      <Sheet onOpenChange={handleOpenChange} open={open}>
        <SheetContent
          className="data-[side=bottom]:max-h-[85vh] data-[side=right]:sm:max-w-xl"
          side={isMobile ? "bottom" : "right"}
        >
          <SheetHeader className="gap-1">
            <SheetTitle>Add widget</SheetTitle>
            <SheetDescription>
              Pick a metric from the library or create your own.
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            {isOrgScope ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-widget-project">Data source</Label>
                <Select
                  items={sourceItems}
                  onValueChange={(value) => value && setPin(value)}
                  value={pin}
                >
                  <SelectTrigger className="w-full" id="add-widget-project">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(sourceItems).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Input
                aria-label="Search widgets"
                className="flex-1"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search widgets…"
                value={search}
              />
              <Button
                onClick={() => setMetricDrawerOpen(true)}
                variant="outline"
              >
                <Plus />
                New metric
              </Button>
            </div>

            {builtins.map((widgetType) => {
              const definition = WIDGET_REGISTRY[widgetType];
              return (
                // The preview itself is a widget — no extra chrome around it.
                <div className="flex flex-col gap-2" key={widgetType}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground text-xs">
                      {definition.description}
                    </span>
                    <Button
                      aria-label={`Add ${definition.title}`}
                      onClick={() => addBuiltin(widgetType)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Plus />
                    </Button>
                  </div>
                  <WidgetPreview>
                    <definition.Renderer
                      config={
                        pinnedProjectId ? { projectId: pinnedProjectId } : {}
                      }
                      from={from}
                      organizationId={organizationId}
                      projectId={projectId}
                      to={to}
                    />
                  </WidgetPreview>
                </div>
              );
            })}

            {savedMetrics.map((metric) => (
              <SavedMetricEntry
                from={from}
                key={metric.id}
                metric={metric}
                onAdd={addMetricWidget}
                organizationId={organizationId}
                pinnedProjectId={pinnedProjectId}
                projectId={projectId}
                Renderer={MetricRenderer}
                to={to}
              />
            ))}

            {builtins.length === 0 && savedMetrics.length === 0 ? (
              <p className="rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
                No widgets match your search.
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <MetricDrawer
        from={from}
        onOpenChange={setMetricDrawerOpen}
        open={metricDrawerOpen}
        organizationId={organizationId}
        projectId={customProjectId}
        to={to}
      />
    </>
  );
};
