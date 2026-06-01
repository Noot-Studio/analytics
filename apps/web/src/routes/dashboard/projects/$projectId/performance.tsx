import { createFileRoute } from "@tanstack/react-router";

import { PerformanceView } from "@/features/analytics/components/organisms/performance-view";

export const Route = createFileRoute(
  "/dashboard/projects/$projectId/performance"
)({
  component: PerformancePage,
});

function PerformancePage() {
  const { projectId } = Route.useParams();
  return <PerformanceView projectId={projectId} />;
}
