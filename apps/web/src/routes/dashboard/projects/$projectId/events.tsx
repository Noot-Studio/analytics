import { createFileRoute } from "@tanstack/react-router";

import { EventsView } from "@/features/analytics/components/organisms/events-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/events")({
  component: EventsPage,
});

function EventsPage() {
  const { projectId } = Route.useParams();
  return <EventsView projectId={projectId} />;
}
