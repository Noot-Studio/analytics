import type { MetricInput, MetricSnapshot } from "@sbox-analytics/api/metrics";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@sbox-analytics/ui/components/sheet";
import { useIsMobile } from "@sbox-analytics/ui/hooks/use-mobile";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

import { MetricBuilder } from "./metric-builder";

interface MetricDrawerProps {
  from: string;
  /** Existing metric to edit; absent opens the drawer in create mode. */
  metric?: MetricSnapshot;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save with the saved metric. */
  onSaved?: (metric: MetricSnapshot) => void;
  open: boolean;
  /** Org to save under when no project is in scope (org-scope dashboards). */
  organizationId?: string;
  /** Project the builder previews against and resolves the org from. */
  projectId?: string;
  to: string;
}

/**
 * The single metric editor shared by the project settings library and the
 * widget creation drawer. Owns the create/update mutations so every entry
 * point saves the same way; the form itself lives in MetricBuilder.
 */
export const MetricDrawer = ({
  from,
  metric,
  onOpenChange,
  onSaved,
  open,
  organizationId,
  projectId,
  to,
}: MetricDrawerProps) => {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const isEditing = Boolean(metric);

  const handleSuccess = (saved: MetricSnapshot) => {
    queryClient.invalidateQueries({ queryKey: orpc.metrics.list.key() });
    onSaved?.(saved);
    onOpenChange(false);
  };

  const createMutation = useMutation({
    ...orpc.metrics.create.mutationOptions(),
    onError: () => toast.error("Failed to create metric"),
    onSuccess: handleSuccess,
  });
  const updateMutation = useMutation({
    ...orpc.metrics.update.mutationOptions(),
    onError: () => toast.error("Failed to save metric"),
    onSuccess: handleSuccess,
  });

  const handleSave = (input: MetricInput) => {
    if (metric) {
      updateMutation.mutate({
        ...input,
        id: metric.id,
        organizationId,
        projectId,
      });
      return;
    }
    createMutation.mutate({ ...input, organizationId, projectId });
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="data-[side=bottom]:max-h-[85vh] data-[side=right]:sm:max-w-xl"
        side={isMobile ? "bottom" : "right"}
      >
        <SheetHeader className="gap-1">
          <SheetTitle>{isEditing ? "Edit metric" : "New metric"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update the query that powers this metric."
              : "Define a metric once and reuse it across dashboards."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
          {projectId ? (
            <MetricBuilder
              from={from}
              isSaving={createMutation.isPending || updateMutation.isPending}
              key={metric?.id ?? "new"}
              metric={metric}
              onSave={handleSave}
              projectId={projectId}
              submitLabel={isEditing ? "Save changes" : "Save metric"}
              to={to}
            />
          ) : (
            <p className="rounded-lg border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
              Metrics query a single project. Pick a project as the data source
              first.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
