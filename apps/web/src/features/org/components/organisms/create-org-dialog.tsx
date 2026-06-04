import { Button } from "@sbox-analytics/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@sbox-analytics/ui/components/dialog";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import { OrgForm } from "../molecules/org-form";

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateOrgDialog = ({
  open,
  onOpenChange,
}: CreateOrgDialogProps) => {
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (values: { name: string; slug: string }) => {
    setIsCreating(true);
    const { data, error } = await authClient.organization.create({
      name: values.name,
      slug: values.slug,
    });
    if (error) {
      toast.error(error.message ?? "Failed to create organization");
      setIsCreating(false);
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>Set up a new workspace</DialogDescription>
        </DialogHeader>
        <OrgForm
          onSubmit={handleSubmit}
          isLoading={isCreating}
          submitLabel="Create Organization"
          cancelAction={
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  );
};
