import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/organization")({
  component: OrganizationPage,
});

function OrganizationPage() {
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <h1 className="text-2xl font-semibold">Organization Settings</h1>
      <p className="text-muted-foreground">
        Organization management will be available here.
      </p>
    </div>
  );
}
