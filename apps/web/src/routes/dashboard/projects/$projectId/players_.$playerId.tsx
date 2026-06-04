import { createFileRoute } from "@tanstack/react-router";

import { PlayerProfileView } from "@/features/analytics/components/organisms/player-profile-view";

export const Route = createFileRoute(
  "/dashboard/projects/$projectId/players_/$playerId"
)({
  component: PlayerProfilePage,
  // Warm the profile aggregates and the default first page of session history
  // on hover/intent so opening a player paints with data. Later table
  // paging/sort/filters hit only insights.playerSessions. Errors surface via
  // the view's useQuery state.
  loader: async ({ context, params }) => {
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(
          context.orpc.insights.playerProfile.queryOptions({
            input: {
              playerId: params.playerId,
              projectId: params.projectId,
            },
          })
        ),
        context.queryClient.ensureQueryData(
          context.orpc.insights.playerSessions.queryOptions({
            input: {
              joinOperator: "and",
              page: 1,
              perPage: 10,
              playerId: params.playerId,
              projectId: params.projectId,
              sortDesc: true,
            },
          })
        ),
      ]);
    } catch {
      // Surfaced by the view's useQuery error state.
    }
  },
});

function PlayerProfilePage() {
  const { playerId, projectId } = Route.useParams();
  return <PlayerProfileView playerId={playerId} projectId={projectId} />;
}
