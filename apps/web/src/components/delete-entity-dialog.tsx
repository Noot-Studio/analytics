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
import type { ReactNode } from "react";
import { useId, useState } from "react";

interface DeleteEntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lowercase noun shown in the title and confirm button, e.g. "project". */
  entityLabel: string;
  /** Exact name the user must type to enable deletion. */
  entityName: string;
  /** Consequences copy explaining what gets removed. */
  description: ReactNode;
  onConfirm: () => void;
  isPending: boolean;
}

export const DeleteEntityDialog = ({
  open,
  onOpenChange,
  entityLabel,
  entityName,
  description,
  onConfirm,
  isPending,
}: DeleteEntityDialogProps) => {
  const inputId = useId();
  const [confirmation, setConfirmation] = useState("");
  const canDelete = confirmation === entityName;

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
          <DialogTitle>Delete {entityLabel}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={inputId}>
            Type <span className="font-semibold">{entityName}</span> to confirm
          </FieldLabel>
          <Input
            autoComplete="off"
            id={inputId}
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
            {isPending ? "Deleting…" : `Delete ${entityLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
