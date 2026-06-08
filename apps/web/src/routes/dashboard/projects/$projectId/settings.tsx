import { createFileRoute, useParams } from "@tanstack/react-router";

import { ProjectSettingsView } from "@/features/projects/components/organisms/project-settings-view";

const SettingsPage = () => {
  const { projectId } = useParams({
    from: "/dashboard/projects/$projectId/settings",
  });
  return <ProjectSettingsView projectId={projectId} />;
};

export const Route = createFileRoute("/dashboard/projects/$projectId/settings")(
  {
    component: SettingsPage,
    // Passthrough so the API-keys data-table's page/sort/filter params persist.
    validateSearch: (search: Record<string, unknown>) => search,
  }
);
