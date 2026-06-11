import type { MetricSnapshot } from "@sbox-analytics/api/metrics";
import { Button } from "@sbox-analytics/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sbox-analytics/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChartLine, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { MetricDrawer } from "../molecules/metric-drawer";

interface MetricsSectionProps {
  projectId: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PREVIEW_DAYS = 7;

export const MetricsSection = ({ projectId }: MetricsSectionProps) => {
  const queryClient = useQueryClient();

  // The library preview needs a window; settings has none, so default to a
  // recent span and freeze it for the section's lifetime.
  const [range] = useState(() => {
    const now = new Date();
    return {
      from: new Date(now.getTime() - PREVIEW_DAYS * DAY_MS).toISOString(),
      to: now.toISOString(),
    };
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<MetricSnapshot | undefined>();
  const [deleting, setDeleting] = useState<MetricSnapshot | null>(null);

  const listQuery = useQuery(
    orpc.metrics.list.queryOptions({ input: { projectId } })
  );
  const metrics = listQuery.data ?? [];

  const deleteMutation = useMutation({
    ...orpc.metrics.delete.mutationOptions(),
    onError: () => toast.error("Failed to delete metric"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.metrics.list.key() });
      setDeleting(null);
      toast.success("Metric deleted");
    },
  });

  const openNew = () => {
    setEditing(undefined);
    setDrawerOpen(true);
  };

  const openEdit = (metric: MetricSnapshot) => {
    setEditing(metric);
    setDrawerOpen(true);
  };

  const showList = !(listQuery.isError || listQuery.isLoading);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">Metrics</h2>
          <p className="text-muted-foreground text-sm">
            Reusable queries you can drop onto any dashboard as a widget.
          </p>
        </div>
        <Button onClick={openNew} size="sm">
          New metric
        </Button>
      </div>

      {listQuery.isError ? (
        <p className="py-6 text-center text-destructive text-sm">
          Failed to load metrics.
        </p>
      ) : null}
      {listQuery.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {showList && metrics.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartLine />
            </EmptyMedia>
            <EmptyTitle>No metrics yet</EmptyTitle>
            <EmptyDescription>
              Create a metric to measure player behavior, then visualize it on a
              dashboard.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {showList && metrics.length > 0 ? (
        <div className="flex flex-col gap-2">
          {metrics.map((metric) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              key={metric.id}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{metric.name}</p>
                <p className="truncate text-muted-foreground text-xs">
                  {metric.description ?? "No description"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  aria-label={`Edit ${metric.name}`}
                  onClick={() => openEdit(metric)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Pencil />
                </Button>
                <Button
                  aria-label={`Delete ${metric.name}`}
                  onClick={() => setDeleting(metric)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <MetricDrawer
        from={range.from}
        metric={editing}
        onOpenChange={setDrawerOpen}
        open={drawerOpen}
        projectId={projectId}
        to={range.to}
      />

      <Dialog
        onOpenChange={(open) => !open && setDeleting(null)}
        open={deleting !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete metric</DialogTitle>
            <DialogDescription>
              Delete “{deleting?.name}”? Widgets that use this metric will stop
              rendering. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleting(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleting &&
                deleteMutation.mutate({ id: deleting.id, projectId })
              }
              variant="destructive"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};
