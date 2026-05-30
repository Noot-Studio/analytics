import { createFileRoute } from "@tanstack/react-router";

import { MapsView } from "@/features/analytics/components/organisms/maps-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/maps")({
  component: MapsPage,
});

function MapsPage() {
  const { projectId } = Route.useParams();
  return <MapsView projectId={projectId} />;
}
