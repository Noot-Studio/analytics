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

import { SecretReveal } from "../atoms/secret-reveal";

interface RotatedKey {
  publishableKey: string;
  secretKey: string;
}

interface RotateApiKeyDialogProps {
  keyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  rotatedKey: RotatedKey | null;
}

export const RotateApiKeyDialog = ({
  isPending,
  keyName,
  onConfirm,
  onOpenChange,
  open,
  rotatedKey,
}: RotateApiKeyDialogProps) => (
  <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Rotate API Key</DialogTitle>
        <DialogDescription>
          {rotatedKey ? (
            "Your new key pair is ready."
          ) : (
            <>
              Rotate{" "}
              <span className="font-medium text-foreground">{keyName}</span>?
              The current key pair will be invalidated immediately.
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      {rotatedKey ? (
        <>
          <SecretReveal
            publishableKey={rotatedKey.publishableKey}
            secretKey={rotatedKey.secretKey}
          />
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button">
              Done
            </Button>
          </DialogFooter>
        </>
      ) : (
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
              <DotmSquare4 ariaLabel="Rotating" dotSize={2} size={18} />
            ) : (
              "Rotate"
            )}
          </Button>
        </DialogFooter>
      )}
    </DialogContent>
  </Dialog>
);
