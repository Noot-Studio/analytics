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

interface RemoveMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  memberName: string;
}

export const RemoveMemberDialog = ({
  isPending,
  memberName,
  onConfirm,
  onOpenChange,
  open,
}: RemoveMemberDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Remove member</DialogTitle>
        <DialogDescription>
          {memberName} will lose access to this organization and all of its
          projects. They can be invited back later.
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
            <DotmSquare4 ariaLabel="Removing" dotSize={2} size={18} />
          ) : (
            "Remove"
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
