import { createFileRoute } from "@tanstack/react-router";

import { MapsView } from "@/features/analytics/components/organisms/maps-view";
import { analyticsSearchSchema } from "@/features/analytics/lib/filters";

export const Route = createFileRoute("/dashboard/projects/$projectId/maps")({
  component: MapsPage,
  validateSearch: analyticsSearchSchema,
});

function MapsPage() {
  const { projectId } = Route.useParams();
  return <MapsView projectId={projectId} />;
}
