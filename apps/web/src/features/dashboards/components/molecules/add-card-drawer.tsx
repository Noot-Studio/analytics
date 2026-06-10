import type { DashboardCardInput } from "@sbox-analytics/api/dashboard-cards";
import { BUILTIN_CARD_TYPES } from "@sbox-analytics/api/dashboard-cards";
import type { MetricInput, MetricSnapshot } from "@sbox-analytics/api/metrics";
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
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Suspense, useState } from "react";
import type { ReactNode } from "react";

import { orpc } from "@/utils/orpc";

import {
  CARD_REGISTRY,
  METRIC_CARD_TYPE,
  metricCardSize,
} from "../../lib/card-registry";
import { useCardSourcePin } from "../../lib/use-card-source-pin";
import type { DashboardScopeValue } from "../../lib/use-dashboard-editor";
import { CardErrorBoundary } from "../atoms/card-error-boundary";
import { MetricBuilder } from "./metric-builder";

interface AddCardDrawerProps {
  from: string;
  onAdd: (card: DashboardCardInput) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId?: string;
  projectId?: string;
  scope: DashboardScopeValue;
  to: string;
}

const CardPreview = ({ children }: { children: ReactNode }) => (
  <div className="pointer-events-none select-none">
    <CardErrorBoundary>
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        {children}
      </Suspense>
    </CardErrorBoundary>
  </div>
);

export const AddCardDrawer = ({
  from,
  onAdd,
  onOpenChange,
  open,
  organizationId,
  projectId,
  scope,
  to,
}: AddCardDrawerProps) => {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const {
    customProjectId,
    isOrgScope,
    pin,
    pinnedProjectId,
    setPin,
    sourceItems,
  } = useCardSourcePin({ open, projectId, scope });
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const metricsQueryOptions = orpc.metrics.list.queryOptions({
    enabled: open,
    input: { organizationId, projectId },
  });
  const { data: metrics } = useQuery(metricsQueryOptions);

  const invalidateMetrics = () =>
    queryClient.invalidateQueries({ queryKey: metricsQueryOptions.queryKey });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch("");
      setIsCreating(false);
    }
    onOpenChange(next);
  };

  const addBuiltin = (cardType: (typeof BUILTIN_CARD_TYPES)[number]) => {
    onAdd({
      cardType,
      config: pinnedProjectId ? { projectId: pinnedProjectId } : {},
      size: CARD_REGISTRY[cardType].defaultSize,
    });
    handleOpenChange(false);
  };

  const addMetricCard = (metric: MetricSnapshot) => {
    onAdd({
      cardType: METRIC_CARD_TYPE,
      config: {
        metricId: metric.id,
        ...(pinnedProjectId ? { projectId: pinnedProjectId } : {}),
      },
      size: metricCardSize(metric.config),
    });
    handleOpenChange(false);
  };

  // Creating saves the metric to the library, then places a card for it.
  const createMutation = useMutation(
    orpc.metrics.create.mutationOptions({
      onSuccess: (metric) => {
        invalidateMetrics();
        addMetricCard(metric);
      },
    })
  );
  const deleteMutation = useMutation(
    orpc.metrics.delete.mutationOptions({ onSuccess: invalidateMetrics })
  );

  const createMetric = (input: MetricInput) => {
    createMutation.mutate({ ...input, organizationId, projectId });
  };

  const query = search.trim().toLowerCase();
  const matches = (...texts: (string | null | undefined)[]) =>
    query === "" || texts.some((text) => text?.toLowerCase().includes(query));

  const builtins = BUILTIN_CARD_TYPES.filter((cardType) => {
    const definition = CARD_REGISTRY[cardType];
    return matches(definition.title, definition.description);
  });
  const savedMetrics = (metrics ?? []).filter((metric) =>
    matches(metric.name, metric.description, "metric")
  );

  const { Renderer: MetricRenderer } = CARD_REGISTRY[METRIC_CARD_TYPE];

  return (
    <Sheet onOpenChange={handleOpenChange} open={open}>
      <SheetContent
        className="data-[side=bottom]:max-h-[85vh] data-[side=right]:sm:max-w-xl"
        side={isMobile ? "bottom" : "right"}
      >
        <SheetHeader className="gap-1">
          <SheetTitle>Add card</SheetTitle>
          <SheetDescription>
            Preview a metric from the library or create your own.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {isOrgScope ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-card-project">Data source</Label>
              <Select
                items={sourceItems}
                onValueChange={(value) => value && setPin(value)}
                value={pin}
              >
                <SelectTrigger className="w-full" id="add-card-project">
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
                onClick={() => setIsCreating(false)}
                size="sm"
                variant="ghost"
              >
                <ArrowLeft />
                Back to library
              </Button>
              {customProjectId ? (
                <MetricBuilder
                  from={from}
                  isSaving={createMutation.isPending}
                  onSave={createMetric}
                  projectId={customProjectId}
                  to={to}
                />
              ) : (
                <p className="rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
                  Metrics query a single project. Pick a project as the data
                  source above first.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Search cards"
                  className="flex-1"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search cards…"
                  value={search}
                />
                <Button onClick={() => setIsCreating(true)} variant="outline">
                  <Plus />
                  New metric
                </Button>
              </div>

              {builtins.map((cardType) => {
                const definition = CARD_REGISTRY[cardType];
                return (
                  // The preview itself is a card — no extra chrome around it.
                  <div className="flex flex-col gap-2" key={cardType}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground text-xs">
                        {definition.description}
                      </span>
                      <Button
                        aria-label={`Add ${definition.title}`}
                        onClick={() => addBuiltin(cardType)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Plus />
                      </Button>
                    </div>
                    <CardPreview>
                      <definition.Renderer
                        config={
                          pinnedProjectId ? { projectId: pinnedProjectId } : {}
                        }
                        from={from}
                        organizationId={organizationId}
                        projectId={projectId}
                        to={to}
                      />
                    </CardPreview>
                  </div>
                );
              })}

              {savedMetrics.map((metric) => (
                <div className="flex flex-col gap-2" key={metric.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground text-xs">
                      {metric.description ?? "Saved metric"}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        aria-label={`Delete ${metric.name}`}
                        disabled={deleteMutation.isPending}
                        onClick={() =>
                          deleteMutation.mutate({
                            id: metric.id,
                            organizationId,
                            projectId,
                          })
                        }
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Trash2 />
                      </Button>
                      <Button
                        aria-label={`Add ${metric.name}`}
                        onClick={() => addMetricCard(metric)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>
                  <CardPreview>
                    <MetricRenderer
                      config={{
                        metricId: metric.id,
                        ...(pinnedProjectId
                          ? { projectId: pinnedProjectId }
                          : {}),
                      }}
                      from={from}
                      organizationId={organizationId}
                      projectId={projectId}
                      to={to}
                    />
                  </CardPreview>
                </div>
              ))}

              {builtins.length === 0 && savedMetrics.length === 0 ? (
                <p className="rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
                  No cards match your search.
                </p>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
