import { createFileRoute } from "@tanstack/react-router";

import { SessionsView } from "@/features/analytics/components/organisms/sessions-view";
import { analyticsSearchSchema } from "@/features/analytics/lib/filters";

export const Route = createFileRoute("/dashboard/projects/$projectId/sessions")(
  {
    component: SessionsPage,
    validateSearch: analyticsSearchSchema,
  }
);

function SessionsPage() {
  const { projectId } = Route.useParams();
  return <SessionsView projectId={projectId} />;
}
