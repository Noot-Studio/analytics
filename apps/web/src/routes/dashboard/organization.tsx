import { createFileRoute } from "@tanstack/react-router";

import { ApiKeysSection } from "@/features/api-keys/components/organisms/api-keys-section";

export const Route = createFileRoute("/dashboard/organization")({
  component: OrganizationPage,
});

function OrganizationPage() {
  return (
    <div className="flex flex-col gap-8 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization's settings and integrations.
        </p>
      </div>
      <ApiKeysSection />
    </div>
  );
}
