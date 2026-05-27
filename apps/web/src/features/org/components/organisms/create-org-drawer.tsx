import { Button } from "@sbox-analytics/ui/components/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@sbox-analytics/ui/components/drawer";
import { useIsMobile } from "@sbox-analytics/ui/hooks/use-mobile";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import { OrgForm } from "../molecules/org-form";

interface CreateOrgDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateOrgDrawer = ({
  open,
  onOpenChange,
}: CreateOrgDrawerProps) => {
  const isMobile = useIsMobile();
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
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      direction={isMobile ? "bottom" : "right"}
    >
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>Create Organization</DrawerTitle>
          <DrawerDescription>Set up a new workspace</DrawerDescription>
        </DrawerHeader>
        <div className="px-4">
          <OrgForm
            onSubmit={handleSubmit}
            isLoading={isCreating}
            submitLabel="Create Organization"
          />
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
