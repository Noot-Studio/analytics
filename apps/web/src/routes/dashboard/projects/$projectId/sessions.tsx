import { createFileRoute } from "@tanstack/react-router";

import { SessionsView } from "@/features/analytics/components/organisms/sessions-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/sessions")(
  {
    component: SessionsPage,
  }
);

function SessionsPage() {
  const { projectId } = Route.useParams();
  return <SessionsView projectId={projectId} />;
}
