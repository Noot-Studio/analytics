import { createFileRoute } from "@tanstack/react-router";

import { LiveEventsView } from "@/features/analytics/components/organisms/live-events-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/live")({
  component: LivePage,
});

function LivePage() {
  const { projectId } = Route.useParams();
  return <LiveEventsView projectId={projectId} />;
}
