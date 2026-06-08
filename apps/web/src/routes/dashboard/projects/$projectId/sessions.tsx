import { createFileRoute, useParams } from "@tanstack/react-router";

import { SessionsView } from "@/features/analytics/components/organisms/sessions-view";
import { analyticsSearchSchema } from "@/features/analytics/lib/filters";

const SessionsPage = () => {
  const { projectId } = useParams({
    from: "/dashboard/projects/$projectId/sessions",
  });
  return <SessionsView projectId={projectId} />;
};

export const Route = createFileRoute("/dashboard/projects/$projectId/sessions")(
  {
    component: SessionsPage,
    validateSearch: analyticsSearchSchema,
  }
);
