import { createFileRoute } from "@tanstack/react-router";

import { RetentionView } from "@/features/analytics/components/organisms/retention-view";
import { analyticsSearchSchema } from "@/features/analytics/lib/filters";

export const Route = createFileRoute(
  "/dashboard/projects/$projectId/retention"
)({
  component: RetentionPage,
  validateSearch: analyticsSearchSchema,
});

function RetentionPage() {
  const { projectId } = Route.useParams();
  return <RetentionView projectId={projectId} />;
}
