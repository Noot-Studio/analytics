import { createFileRoute } from "@tanstack/react-router";

import { OverviewView } from "@/features/analytics/components/organisms/overview-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/overview")(
  {
    component: OverviewPage,
  }
);

function OverviewPage() {
  const { projectId } = Route.useParams();
  return <OverviewView projectId={projectId} />;
}
