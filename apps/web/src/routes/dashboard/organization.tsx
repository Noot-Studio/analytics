import { createFileRoute } from "@tanstack/react-router";

import { OrgSettingsSection } from "@/features/org/components/organisms/org-settings-section";

const OrganizationPage = () => (
  <div className="flex flex-col gap-8 p-4 lg:p-6">
    <div>
      <h1 className="font-semibold text-2xl">Organization Settings</h1>
      <p className="text-muted-foreground">
        Manage your organization's profile and membership.
      </p>
    </div>
    <OrgSettingsSection />
  </div>
);

export const Route = createFileRoute("/dashboard/organization")({
  component: OrganizationPage,
});
