import type {
  AlertRuleInput,
  AlertRuleSnapshot,
} from "@sbox-analytics/api/alerts/schema";
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

import { AlertForm } from "./alert-form";

interface AlertScope {
  organizationId?: string;
  projectId?: string;
}

interface AlertDrawerProps {
  /** Existing rule to edit; absent opens the drawer in create mode. */
  alert?: AlertRuleSnapshot;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  scope: AlertScope;
}

/**
 * The alert editor shared by project and org settings. Owns the create/update
 * mutations so every entry point saves the same way; the form lives in
 * AlertForm. The scope (`projectId` or `organizationId`) is threaded into every
 * mutation so the rule lands on the right project or org.
 */
export const AlertDrawer = ({
  alert,
  onOpenChange,
  open,
  scope,
}: AlertDrawerProps) => {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const isEditing = Boolean(alert);

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: orpc.alerts.list.key() });
    onOpenChange(false);
  };

  const createMutation = useMutation({
    ...orpc.alerts.create.mutationOptions(),
    onError: () => toast.error("Failed to create alert"),
    onSuccess: () => {
      handleSuccess();
      toast.success("Alert created");
    },
  });
  const updateMutation = useMutation({
    ...orpc.alerts.update.mutationOptions(),
    onError: () => toast.error("Failed to save alert"),
    onSuccess: () => {
      handleSuccess();
      toast.success("Alert saved");
    },
  });

  const handleSave = (input: AlertRuleInput) => {
    if (alert) {
      updateMutation.mutate({ ...input, ...scope, id: alert.id });
      return;
    }
    createMutation.mutate({ ...input, ...scope });
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="data-[side=bottom]:max-h-[85vh] data-[side=right]:sm:max-w-md"
        side={isMobile ? "bottom" : "right"}
      >
        <SheetHeader className="gap-1">
          <SheetTitle>{isEditing ? "Edit alert" : "New alert"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update this alert rule."
              : "Get notified when a crash spike or DAU drop crosses your threshold."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
          <AlertForm
            alert={alert}
            isSaving={createMutation.isPending || updateMutation.isPending}
            key={alert?.id ?? "new"}
            onSave={handleSave}
            submitLabel={isEditing ? "Save changes" : "Create alert"}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};
