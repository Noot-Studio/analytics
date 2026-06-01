import { createFileRoute } from "@tanstack/react-router";

import { RetentionView } from "@/features/analytics/components/organisms/retention-view";

export const Route = createFileRoute(
  "/dashboard/projects/$projectId/retention"
)({
  component: RetentionPage,
});

function RetentionPage() {
  const { projectId } = Route.useParams();
  return <RetentionView projectId={projectId} />;
}
