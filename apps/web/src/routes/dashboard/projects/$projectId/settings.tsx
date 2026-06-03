import { createFileRoute } from "@tanstack/react-router";

import { ProjectSettingsView } from "@/features/projects/components/organisms/project-settings-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/settings")(
  {
    component: SettingsPage,
    // Passthrough so the API-keys data-table's page/sort/filter params persist.
    validateSearch: (search: Record<string, unknown>) => search,
  }
);

function SettingsPage() {
  const { projectId } = Route.useParams();
  return <ProjectSettingsView projectId={projectId} />;
}
