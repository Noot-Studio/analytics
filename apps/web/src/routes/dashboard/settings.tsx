import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <h1 className="text-2xl font-semibold">User Settings</h1>
      <p className="text-muted-foreground">
        User settings will be available here.
      </p>
    </div>
  );
}
