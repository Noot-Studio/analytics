import { createFileRoute } from "@tanstack/react-router";

import { PlayerProfileView } from "@/features/analytics/components/organisms/player-profile-view";

export const Route = createFileRoute(
  "/dashboard/projects/$projectId/players_/$playerId"
)({
  component: PlayerProfilePage,
});

function PlayerProfilePage() {
  const { playerId, projectId } = Route.useParams();
  return <PlayerProfileView playerId={playerId} projectId={projectId} />;
}
