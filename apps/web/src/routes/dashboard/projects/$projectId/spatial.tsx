import { createFileRoute } from "@tanstack/react-router";

import { SpatialView } from "@/features/analytics/components/organisms/spatial-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/spatial")({
  component: SpatialPage,
});

function SpatialPage() {
  const { projectId } = Route.useParams();
  return <SpatialView projectId={projectId} />;
}
