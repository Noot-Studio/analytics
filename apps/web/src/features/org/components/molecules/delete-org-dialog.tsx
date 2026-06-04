import { Button } from "@sbox-analytics/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sbox-analytics/ui/components/dialog";
import { Field, FieldLabel } from "@sbox-analytics/ui/components/field";
import { Input } from "@sbox-analytics/ui/components/input";
import { useState } from "react";

interface DeleteOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationName: string;
  onConfirm: () => void;
  isPending: boolean;
}

export const DeleteOrgDialog = ({
  open,
  onOpenChange,
  organizationName,
  onConfirm,
  isPending,
}: DeleteOrgDialogProps) => {
  const [confirmation, setConfirmation] = useState("");
  const canDelete = confirmation === organizationName;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmation("");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete organization</DialogTitle>
          <DialogDescription>
            This permanently deletes {organizationName}, including all of its
            projects, API keys, dashboards, and analytics data. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="delete-org-confirmation">
            Type <span className="font-semibold">{organizationName}</span> to
            confirm
          </FieldLabel>
          <Input
            autoComplete="off"
            id="delete-org-confirmation"
            onChange={(e) => setConfirmation(e.target.value)}
            value={confirmation}
          />
        </Field>
        <DialogFooter>
          <Button
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!canDelete || isPending}
            onClick={onConfirm}
            variant="destructive"
          >
            {isPending ? "Deleting…" : "Delete organization"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
