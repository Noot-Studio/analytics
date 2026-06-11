import type { DashboardWidgetInput } from "@sbox-analytics/api/dashboard-widgets";
import { BUILTIN_WIDGET_TYPES } from "@sbox-analytics/api/dashboard-widgets";
import type { WidgetInput, WidgetSnapshot } from "@sbox-analytics/api/widgets";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { Suspense, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import type { DashboardScopeValue } from "../../lib/use-dashboard-editor";
import { useWidgetSourcePin } from "../../lib/use-widget-source-pin";
import {
  WIDGET_REGISTRY,
  METRIC_WIDGET_TYPE,
  metricWidgetSize,
} from "../../lib/widget-registry";
import { WidgetErrorBoundary } from "../atoms/widget-error-boundary";
import { MetricDrawer } from "./metric-drawer";
import { WidgetBuilder } from "./widget-builder";

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

const WidgetPreview = ({ children }: { children: ReactNode }) => (
  <div className="pointer-events-none select-none">
    <WidgetErrorBoundary>
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        {children}
      </Suspense>
    </WidgetErrorBoundary>
  </div>
);

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
  const queryClient = useQueryClient();
  const {
    customProjectId,
    isOrgScope,
    pin,
    pinnedProjectId,
    setPin,
    sourceItems,
  } = useWidgetSourcePin({ open, projectId, scope });
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"library" | "create">("library");
  const [metricDrawerOpen, setMetricDrawerOpen] = useState(false);
  const [selectedMetricId, setSelectedMetricId] = useState<string>();

  const { data: widgets } = useQuery(
    orpc.widgets.list.queryOptions({
      enabled: open,
      input: { organizationId, projectId },
    })
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch("");
      setMode("library");
      setMetricDrawerOpen(false);
      setSelectedMetricId(undefined);
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

  /** Placing a saved widget copies its config onto the dashboard. */
  const placeWidget = (widget: WidgetSnapshot) => {
    onAdd({
      config: {
        ...widget.config,
        metricId: widget.metricId,
        ...(pinnedProjectId ? { projectId: pinnedProjectId } : {}),
      },
      size: metricWidgetSize(widget.config.visualization),
      widgetType: METRIC_WIDGET_TYPE,
    });
    handleOpenChange(false);
  };

  const createWidgetMutation = useMutation({
    ...orpc.widgets.create.mutationOptions(),
    onError: () => toast.error("Failed to save widget"),
    onSuccess: (widget: WidgetSnapshot) => {
      queryClient.invalidateQueries({ queryKey: orpc.widgets.list.key() });
      placeWidget(widget);
    },
  });

  const saveWidget = (input: WidgetInput) => {
    createWidgetMutation.mutate({
      ...input,
      config: {
        ...input.config,
        ...(pinnedProjectId ? { projectId: pinnedProjectId } : {}),
      },
      organizationId,
      projectId,
    });
  };

  const query = search.trim().toLowerCase();
  const matches = (...texts: (string | null | undefined)[]) =>
    query === "" || texts.some((text) => text?.toLowerCase().includes(query));

  const builtins = BUILTIN_WIDGET_TYPES.filter((widgetType) => {
    const definition = WIDGET_REGISTRY[widgetType];
    return matches(definition.title, definition.description);
  });
  const savedWidgets = (widgets ?? []).filter((widget) => matches(widget.name));

  const { Renderer: MetricRenderer } = WIDGET_REGISTRY[METRIC_WIDGET_TYPE];
  const isCreating = mode === "create";

  return (
    <>
      <Sheet onOpenChange={handleOpenChange} open={open}>
        <SheetContent
          className="data-[side=bottom]:max-h-[85vh] data-[side=right]:sm:max-w-xl"
          side={isMobile ? "bottom" : "right"}
        >
          <SheetHeader className="gap-1">
            <SheetTitle>{isCreating ? "New widget" : "Add widget"}</SheetTitle>
            <SheetDescription>
              {isCreating
                ? "Pick a metric, then choose how to draw it."
                : "Pick a widget from the library or create a new one."}
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

            {isCreating ? (
              <>
                <Button
                  className="self-start"
                  onClick={() => setMode("library")}
                  size="sm"
                  variant="ghost"
                >
                  <ArrowLeft />
                  Back to library
                </Button>
                <WidgetBuilder
                  isSaving={createWidgetMutation.isPending}
                  onCreateMetric={() => setMetricDrawerOpen(true)}
                  onSave={saveWidget}
                  onSelectMetric={setSelectedMetricId}
                  organizationId={organizationId}
                  projectId={projectId}
                  renderPreview={(config) => (
                    <WidgetPreview>
                      <MetricRenderer
                        config={{
                          ...config,
                          ...(pinnedProjectId
                            ? { projectId: pinnedProjectId }
                            : {}),
                        }}
                        from={from}
                        organizationId={organizationId}
                        projectId={projectId}
                        to={to}
                      />
                    </WidgetPreview>
                  )}
                  selectedMetricId={selectedMetricId}
                />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Search widgets"
                    className="flex-1"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search widgets…"
                    value={search}
                  />
                  <Button onClick={() => setMode("create")} variant="outline">
                    <Plus />
                    New widget
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
                            pinnedProjectId
                              ? { projectId: pinnedProjectId }
                              : {}
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

                {savedWidgets.map((widget) => (
                  <div className="flex flex-col gap-2" key={widget.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground text-xs">
                        {widget.name}
                      </span>
                      <Button
                        aria-label={`Add ${widget.name}`}
                        onClick={() => placeWidget(widget)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Plus />
                      </Button>
                    </div>
                    <WidgetPreview>
                      <MetricRenderer
                        config={{
                          ...widget.config,
                          metricId: widget.metricId,
                          ...(pinnedProjectId
                            ? { projectId: pinnedProjectId }
                            : {}),
                        }}
                        from={from}
                        organizationId={organizationId}
                        projectId={projectId}
                        to={to}
                      />
                    </WidgetPreview>
                  </div>
                ))}

                {builtins.length === 0 && savedWidgets.length === 0 ? (
                  <p className="rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
                    No widgets match your search.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <MetricDrawer
        from={from}
        onOpenChange={setMetricDrawerOpen}
        onSaved={(metric) => setSelectedMetricId(metric.id)}
        open={metricDrawerOpen}
        organizationId={organizationId}
        projectId={customProjectId}
        to={to}
      />
    </>
  );
};
