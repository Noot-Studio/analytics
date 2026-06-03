import { createFileRoute } from "@tanstack/react-router";

import { SpatialView } from "@/features/analytics/components/organisms/spatial-view";
import { analyticsSearchSchema } from "@/features/analytics/lib/filters";

export const Route = createFileRoute("/dashboard/projects/$projectId/spatial")({
  component: SpatialPage,
  validateSearch: analyticsSearchSchema,
});

function SpatialPage() {
  const { projectId } = Route.useParams();
  return <SpatialView projectId={projectId} />;
}
