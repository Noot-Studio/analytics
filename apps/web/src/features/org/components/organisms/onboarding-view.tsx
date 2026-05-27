import { useNavigate } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import { OrgForm } from "../molecules/org-form";

export const OnboardingView = () => {
  const navigate = useNavigate();
  const { data: orgs, isPending } = authClient.useListOrganizations();
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isPending && orgs && orgs.length > 0) {
      navigate({ to: "/dashboard" });
    }
  }, [isPending, orgs, navigate]);

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
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-8 items-center justify-center rounded-md">
              <BarChart3 className="size-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold">Create your organization</h1>
            <p className="text-sm text-muted-foreground">
              Set up your workspace to get started
            </p>
          </div>
          <OrgForm
            onSubmit={handleSubmit}
            isLoading={isCreating}
            submitLabel="Create Organization"
          />
        </div>
      </div>
    </div>
  );
};
