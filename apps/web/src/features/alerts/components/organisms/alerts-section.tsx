import { Button } from "@sbox-analytics/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sbox-analytics/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { TableSkeleton } from "@/components/table-skeleton";
import { orpc } from "@/utils/orpc";

import { AlertFormDialog } from "../molecules/alert-form-dialog";
import type {
  AlertChannel,
  AlertFormValues,
  AlertMetric,
} from "../molecules/alert-form-dialog";
import { DeleteAlertDialog } from "../molecules/delete-alert-dialog";

interface AlertRuleRow {
  id: string;
  name: string;
  metric: AlertMetric;
  threshold: number;
  channel: AlertChannel;
  destination: string;
  enabled: boolean;
  lastFiredAt: Date | null;
}

const METRIC_LABELS: Record<AlertMetric, string> = {
  CrashSpike: "Crash spike",
  DauDrop: "DAU drop",
};

const formatThreshold = (rule: AlertRuleRow): string =>
  rule.metric === "CrashSpike"
    ? `${rule.threshold} crashes/hr`
    : `${rule.threshold}% drop`;

const formatLastFired = (date: Date | null): string => {
  if (!date) {
    return "Never fired";
  }
  return `Fired ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(date))}`;
};

export const AlertsSection = ({ projectId }: { projectId: string }) => {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AlertRuleRow | null>(null);
  const [deleting, setDeleting] = useState<AlertRuleRow | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: orpc.alerts.list.key() });

  const listQuery = useQuery(
    orpc.alerts.list.queryOptions({ input: { projectId } })
  );

  const createMutation = useMutation({
    ...orpc.alerts.create.mutationOptions(),
    onError: () => toast.error("Failed to create alert"),
    onSuccess: () => {
      setFormOpen(false);
      invalidate();
      toast.success("Alert created");
    },
  });

  const updateMutation = useMutation({
    ...orpc.alerts.update.mutationOptions(),
    onError: () => toast.error("Failed to update alert"),
    onSuccess: () => {
      setFormOpen(false);
      invalidate();
      toast.success("Alert updated");
    },
  });

  const deleteMutation = useMutation({
    ...orpc.alerts.delete.mutationOptions(),
    onError: () => toast.error("Failed to delete alert"),
    onSuccess: () => {
      setDeleting(null);
      invalidate();
      toast.success("Alert deleted");
    },
  });

  const evaluateMutation = useMutation({
    ...orpc.alerts.evaluate.mutationOptions(),
    onError: () => toast.error("Failed to run alert check"),
    onSuccess: (data) =>
      toast.success(
        data.fired === 0
          ? "Checked — no alerts fired"
          : `Checked — ${data.fired} alert(s) fired`
      ),
  });

  const handleSubmit = (values: AlertFormValues) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...values });
      return;
    }
    createMutation.mutate({
      channel: values.channel,
      destination: values.destination,
      metric: values.metric,
      name: values.name,
      projectId,
      threshold: values.threshold,
    });
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (rule: AlertRuleRow) => {
    setEditing(rule);
    setFormOpen(true);
  };

  const rows = (listQuery.data?.rows ?? []) as AlertRuleRow[];
  const isEmpty = rows.length === 0;
  const showTable = !(listQuery.isError || listQuery.isLoading) && !isEmpty;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">Alerts</h2>
          <p className="text-muted-foreground text-sm">
            Threshold rules on crash spikes and DAU drops, delivered by webhook
            or email.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={evaluateMutation.isPending || isEmpty}
            onClick={() => evaluateMutation.mutate({ projectId })}
            size="sm"
            variant="outline"
          >
            Run check
          </Button>
          <Button onClick={openCreate} size="sm">
            Create alert
          </Button>
        </div>
      </div>

      {listQuery.isError ? (
        <p className="py-6 text-center text-destructive text-sm">
          Failed to load alerts.
        </p>
      ) : null}
      {listQuery.isLoading ? <TableSkeleton rows={3} /> : null}
      {!(listQuery.isError || listQuery.isLoading) && isEmpty ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BellRing />
            </EmptyMedia>
            <EmptyTitle>No alerts yet</EmptyTitle>
            <EmptyDescription>
              Create an alert to get notified when crashes spike or active
              players drop.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {showTable ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Metric</TableHead>
              <TableHead>Threshold</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-medium">{rule.name}</TableCell>
                <TableCell>{METRIC_LABELS[rule.metric]}</TableCell>
                <TableCell>{formatThreshold(rule)}</TableCell>
                <TableCell>
                  <span className="text-muted-foreground text-xs">
                    {rule.channel} · {rule.destination}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground text-xs">
                    {rule.enabled ? "Active" : "Paused"} ·{" "}
                    {formatLastFired(rule.lastFiredAt)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => openEdit(rule)}
                      size="sm"
                      variant="outline"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => setDeleting(rule)}
                      size="sm"
                      variant="destructive"
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <AlertFormDialog
        initial={editing}
        isPending={createMutation.isPending || updateMutation.isPending}
        mode={editing ? "edit" : "create"}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        open={formOpen}
      />

      <DeleteAlertDialog
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate({ id: deleting.id })}
        onOpenChange={(open) => !open && setDeleting(null)}
        open={deleting !== null}
        ruleName={deleting?.name ?? ""}
      />
    </section>
  );
};
