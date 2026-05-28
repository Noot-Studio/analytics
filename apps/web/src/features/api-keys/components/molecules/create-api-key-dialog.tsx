import { Button } from "@sbox-analytics/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sbox-analytics/ui/components/dialog";
import { Input } from "@sbox-analytics/ui/components/input";
import { Label } from "@sbox-analytics/ui/components/label";
import { useState } from "react";

import { SecretReveal } from "../atoms/secret-reveal";

interface CreatedKey {
  id: string;
  name: string;
  publishableKey: string;
  secretKey: string;
}

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => void;
  isPending: boolean;
  createdKey: CreatedKey | null;
}

export function CreateApiKeyDialog({
  createdKey,
  isPending,
  onOpenChange,
  onCreate,
  open,
}: CreateApiKeyDialogProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onCreate(name.trim());
  };

  const handleClose = (next: boolean) => {
    if (!next) setName("");
    onOpenChange(next);
  };

  return (
    <Dialog onOpenChange={handleClose} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription>
            {createdKey
              ? "Your key pair has been created."
              : "Give this key a name so you can identify it later."}
          </DialogDescription>
        </DialogHeader>

        {createdKey ? (
          <>
            <SecretReveal
              publishableKey={createdKey.publishableKey}
              secretKey={createdKey.secretKey}
            />
            <DialogFooter>
              <Button onClick={() => handleClose(false)} type="button">
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="key-name">Name</Label>
                <Input
                  autoFocus
                  id="key-name"
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production"
                  value={name}
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button
                onClick={() => handleClose(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isPending || !name.trim()} type="submit">
                {isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
