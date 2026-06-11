import type { AlertRuleSnapshot } from "@sbox-analytics/api/alerts/schema";
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
import { Bell, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { AlertDrawer } from "../molecules/alert-drawer";

interface AlertScope {
  organizationId?: string;
  projectId?: string;
}

const WINDOW_LABELS: Record<AlertRuleSnapshot["window"], string> = {
  Last24Hours: "last 24h",
  Last7Days: "last 7d",
  LastHour: "last hour",
};

const metricLabel = (alert: AlertRuleSnapshot): string =>
  `${alert.metricName} ${alert.operator === "Above" ? "≥" : "≤"} ${alert.threshold} (${WINDOW_LABELS[alert.window]})`;

const channelLabel = (alert: AlertRuleSnapshot): string =>
  `${alert.channel} → ${alert.destination}`;

export const AlertsSection = ({ scope }: { scope: AlertScope }) => {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AlertRuleSnapshot | undefined>();
  const [deleting, setDeleting] = useState<AlertRuleSnapshot | null>(null);

  const listQuery = useQuery(orpc.alerts.list.queryOptions({ input: scope }));
  const alerts = listQuery.data ?? [];

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: orpc.alerts.list.key() });

  const deleteMutation = useMutation({
    ...orpc.alerts.delete.mutationOptions(),
    onError: () => toast.error("Failed to delete alert"),
    onSuccess: () => {
      invalidateList();
      setDeleting(null);
      toast.success("Alert deleted");
    },
  });

  const evaluateMutation = useMutation({
    ...orpc.alerts.evaluate.mutationOptions(),
    onError: () => toast.error("Failed to run check"),
    onSuccess: (result) => {
      invalidateList();
      toast.success(
        result.fired > 0
          ? `${result.fired} alert${result.fired === 1 ? "" : "s"} fired`
          : `Checked ${result.checked} rule${result.checked === 1 ? "" : "s"} — nothing fired`
      );
    },
  });

  const openNew = () => {
    setEditing(undefined);
    setDrawerOpen(true);
  };

  const openEdit = (alert: AlertRuleSnapshot) => {
    setEditing(alert);
    setDrawerOpen(true);
  };

  const showList = !(listQuery.isError || listQuery.isLoading);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">Alerts</h2>
          <p className="text-muted-foreground text-sm">
            Threshold rules on any saved metric, delivered by webhook or email.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={evaluateMutation.isPending || alerts.length === 0}
            onClick={() => evaluateMutation.mutate(scope)}
            size="sm"
            variant="outline"
          >
            <Play />
            Run check
          </Button>
          <Button onClick={openNew} size="sm">
            New alert
          </Button>
        </div>
      </div>

      {listQuery.isError ? (
        <p className="py-6 text-center text-destructive text-sm">
          Failed to load alerts.
        </p>
      ) : null}
      {listQuery.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {showList && alerts.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bell />
            </EmptyMedia>
            <EmptyTitle>No alerts yet</EmptyTitle>
            <EmptyDescription>
              Create an alert to get notified when a metric crosses your
              threshold.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {showList && alerts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              key={alert.id}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-sm">{alert.name}</p>
                  {alert.enabled ? null : (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                      Disabled
                    </span>
                  )}
                </div>
                <p className="truncate text-muted-foreground text-xs">
                  {metricLabel(alert)} · {channelLabel(alert)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  aria-label={`Edit ${alert.name}`}
                  onClick={() => openEdit(alert)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Pencil />
                </Button>
                <Button
                  aria-label={`Delete ${alert.name}`}
                  onClick={() => setDeleting(alert)}
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

      <AlertDrawer
        alert={editing}
        onOpenChange={setDrawerOpen}
        open={drawerOpen}
        scope={scope}
      />

      <Dialog
        onOpenChange={(open) => !open && setDeleting(null)}
        open={deleting !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete alert</DialogTitle>
            <DialogDescription>
              Delete “{deleting?.name}”? This alert will stop firing. This can't
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleting(null)} variant="outline">
              Cancel
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleting && deleteMutation.mutate({ ...scope, id: deleting.id })
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
