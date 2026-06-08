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

interface RevokeApiKeyDialogProps {
  keyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export const RevokeApiKeyDialog = ({
  isPending,
  keyName,
  onConfirm,
  onOpenChange,
  open,
}: RevokeApiKeyDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Revoke API Key</DialogTitle>
        <DialogDescription>
          Revoke <span className="font-medium text-foreground">{keyName}</span>?
          Any game client using this key will stop working immediately. This
          cannot be undone.
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
            <DotmSquare4 ariaLabel="Revoking" dotSize={2} size={18} />
          ) : (
            "Revoke"
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
