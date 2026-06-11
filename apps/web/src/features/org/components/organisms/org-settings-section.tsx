import { Button } from "@sbox-analytics/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@sbox-analytics/ui/components/dialog";
import { Separator } from "@sbox-analytics/ui/components/separator";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { DeleteEntityDialog } from "@/components/delete-entity-dialog";
import { ImageUploadControl } from "@/components/image-upload-control";
import { OrgAvatar } from "@/components/org-avatar";
import { authClient } from "@/lib/auth-client";
import { downscaleImage } from "@/lib/image";
import { client } from "@/utils/orpc";

import { OrgForm } from "../molecules/org-form";

const MANAGER_ROLES = new Set(["owner", "admin"]);

export const OrgSettingsSection = () => {
  const { data: activeOrg, isPending: isLoadingOrg } =
    authClient.useActiveOrganization();
  const organizationId = activeOrg?.id;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const memberQuery = useQuery({
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await authClient.organization.getActiveMember();
      if (error || !data) {
        throw new Error(error?.message ?? "Failed to load membership");
      }
      return data;
    },
    queryKey: ["active-member", organizationId],
  });

  const role = memberQuery.data?.role;
  const canManage = Boolean(role && MANAGER_ROLES.has(role));
  const isOwner = role === "owner";

  // Re-activating refreshes the cached active-org store (sidebar, header).
  const refreshActiveOrg = async () => {
    if (organizationId) {
      await authClient.organization.setActive({ organizationId });
    }
  };

  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      if (!organizationId) {
        throw new Error("No active organization");
      }
      const resized = await downscaleImage(file);
      const { url } = await client.images.uploadOrgLogo({
        file: resized,
        organizationId,
      });
      const { error } = await authClient.organization.update({
        data: { logo: url },
        organizationId,
      });
      if (error) {
        throw new Error(error.message ?? "Failed to update logo");
      }
      await refreshActiveOrg();
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => toast.success("Logo updated"),
  });

  const removeLogo = useMutation({
    mutationFn: async () => {
      if (!organizationId) {
        throw new Error("No active organization");
      }
      await client.images.removeOrgLogo({ organizationId });
      await refreshActiveOrg();
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => toast.success("Logo removed"),
  });

  const updateOrg = async (values: { name: string; slug: string }) => {
    const { error } = await authClient.organization.update({
      data: values,
      organizationId,
    });
    if (error) {
      toast.error(error.message ?? "Failed to update organization");
      return;
    }
    // Re-activating refreshes the cached active-org store (sidebar, header).
    if (organizationId) {
      await authClient.organization.setActive({ organizationId });
    }
    toast.success("Organization updated");
  };

  const deleteOrg = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.delete({
        organizationId: organizationId ?? "",
      });
      if (error) {
        throw new Error(error.message ?? "Failed to delete organization");
      }
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => {
      // Full reload so the dashboard guard picks the next org or onboarding.
      window.location.assign("/dashboard");
    },
  });

  const leaveOrg = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.leave({
        organizationId: organizationId ?? "",
      });
      if (error) {
        throw new Error(error.message ?? "Failed to leave organization");
      }
    },
    onError: (error) => toast.error(error.message),
    onSuccess: () => {
      window.location.assign("/dashboard");
    },
  });

  if (isLoadingOrg || !activeOrg || memberQuery.isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full max-w-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold text-lg">Profile</h2>
          <p className="text-muted-foreground text-sm">
            Your organization's name and URL slug.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <OrgAvatar
            className="size-10 rounded-lg"
            logo={activeOrg.logo}
            name={activeOrg.name}
            seed={activeOrg.slug ?? activeOrg.id}
          />
          {canManage ? (
            <div className="flex flex-col gap-1.5">
              <ImageUploadControl
                hasImage={Boolean(activeOrg.logo)}
                onRemove={() => removeLogo.mutate()}
                onUpload={(file) => uploadLogo.mutate(file)}
                pending={uploadLogo.isPending || removeLogo.isPending}
              />
              <p className="text-muted-foreground text-xs">
                PNG, JPEG, or WebP. Without an upload, a logo is generated from
                the organization slug.
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Logos are generated from the organization slug.
            </p>
          )}
        </div>
        {canManage ? (
          <div className="max-w-lg">
            <OrgForm
              defaultValues={{
                name: activeOrg.name,
                slug: activeOrg.slug ?? "",
              }}
              isLoading={false}
              onSubmit={updateOrg}
              submitLabel="Save changes"
            />
          </div>
        ) : (
          <dl className="grid max-w-lg gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{activeOrg.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Slug</dt>
              <dd>{activeOrg.slug}</dd>
            </div>
            <p className="text-muted-foreground text-xs">
              Only owners and admins can edit organization details.
            </p>
          </dl>
        )}
      </section>

      <Separator />

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold text-destructive text-lg">
            Danger zone
          </h2>
          <p className="text-muted-foreground text-sm">
            Irreversible actions for this organization.
          </p>
        </div>
        <div className="flex max-w-lg flex-col gap-4 rounded-lg border border-destructive/40 p-4">
          {isOwner ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-sm">Delete organization</p>
                <p className="text-muted-foreground text-sm">
                  Permanently delete {activeOrg.name} and all of its data.
                </p>
              </div>
              <Button
                onClick={() => setDeleteOpen(true)}
                size="sm"
                variant="destructive"
              >
                Delete
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-sm">Leave organization</p>
                <p className="text-muted-foreground text-sm">
                  You will lose access to {activeOrg.name} and its projects.
                </p>
              </div>
              <Button
                onClick={() => setLeaveOpen(true)}
                size="sm"
                variant="destructive"
              >
                Leave
              </Button>
            </div>
          )}
        </div>
      </section>

      <DeleteEntityDialog
        description={
          <>
            This permanently deletes {activeOrg.name}, including all of its
            projects, API keys, dashboards, and analytics data. This cannot be
            undone.
          </>
        }
        entityLabel="organization"
        entityName={activeOrg.name}
        isPending={deleteOrg.isPending}
        onConfirm={() => deleteOrg.mutate()}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
      />

      <Dialog onOpenChange={setLeaveOpen} open={leaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave organization</DialogTitle>
            <DialogDescription>
              You will lose access to {activeOrg.name}. An owner or admin will
              need to invite you again to rejoin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setLeaveOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={leaveOrg.isPending}
              onClick={() => leaveOrg.mutate()}
              variant="destructive"
            >
              {leaveOrg.isPending ? "Leaving…" : "Leave organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
