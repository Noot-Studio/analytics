import { createFileRoute } from "@tanstack/react-router";

import { AccountSettingsSection } from "@/features/account/components/organisms/account-settings-section";

const SettingsPage = () => (
  <div className="flex flex-col gap-8 p-4 lg:p-6">
    <div>
      <h1 className="font-semibold text-2xl">Profile Settings</h1>
      <p className="text-muted-foreground">
        Manage your profile, password, and active sessions.
      </p>
    </div>
    <AccountSettingsSection />
  </div>
);

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});
