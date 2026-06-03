import { createFileRoute } from "@tanstack/react-router";

import { FunnelsView } from "@/features/analytics/components/organisms/funnels-view";
import { analyticsSearchSchema } from "@/features/analytics/lib/filters";

export const Route = createFileRoute("/dashboard/projects/$projectId/funnels")({
  component: FunnelsPage,
  validateSearch: analyticsSearchSchema,
});

function FunnelsPage() {
  const { projectId } = Route.useParams();
  return <FunnelsView projectId={projectId} />;
}
