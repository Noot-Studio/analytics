import { createFileRoute } from "@tanstack/react-router";

import { ProjectSettingsView } from "@/features/projects/components/organisms/project-settings-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/settings")(
  {
    component: SettingsPage,
  }
);

function SettingsPage() {
  const { projectId } = Route.useParams();
  return <ProjectSettingsView projectId={projectId} />;
}
