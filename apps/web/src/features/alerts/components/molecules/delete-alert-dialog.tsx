import { Button } from "@sbox-analytics/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sbox-analytics/ui/components/dialog";
import { DotmSquare4 } from "@sbox-analytics/ui/components/dotm-square-4";

interface DeleteAlertDialogProps {
  ruleName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export const DeleteAlertDialog = ({
  isPending,
  ruleName,
  onConfirm,
  onOpenChange,
  open,
}: DeleteAlertDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete alert</DialogTitle>
        <DialogDescription>
          Delete <span className="font-medium text-foreground">{ruleName}</span>
          ? This alert will stop being evaluated. This cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          onClick={() => onOpenChange(false)}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          disabled={isPending}
          onClick={onConfirm}
          type="button"
          variant="destructive"
        >
          {isPending ? (
            <DotmSquare4 ariaLabel="Deleting" dotSize={2} size={18} />
          ) : (
            "Delete"
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
