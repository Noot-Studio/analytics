import { createFileRoute } from "@tanstack/react-router";

import { PlayersView } from "@/features/analytics/components/organisms/players-view";

export const Route = createFileRoute("/dashboard/projects/$projectId/players")({
  component: PlayersPage,
});

function PlayersPage() {
  const { projectId } = Route.useParams();
  return <PlayersView projectId={projectId} />;
}
