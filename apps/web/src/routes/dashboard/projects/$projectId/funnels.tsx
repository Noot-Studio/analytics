import { createFileRoute } from "@tanstack/react-router";

import { FunnelsView } from "@/features/analytics/components/organisms/funnels-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/funnels")({
  component: FunnelsPage,
});

function FunnelsPage() {
  const { projectId } = Route.useParams();
  return <FunnelsView projectId={projectId} />;
}
