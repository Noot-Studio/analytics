import { createFileRoute } from "@tanstack/react-router";

import { PlayerProfileView } from "@/features/analytics/components/organisms/player-profile-view";

export const Route = createFileRoute(
  "/dashboard/projects/$projectId/players_/$playerId"
)({
  component: PlayerProfilePage,
  // Warm the default profile (first page of sessions) on hover/intent so opening
  // a player paints with data. Session table paging/sort/filters resolve after
  // mount with keepPreviousData. Errors surface via the view's useQuery state.
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        context.orpc.insights.playerProfile.queryOptions({
          input: {
            playerId: params.playerId,
            projectId: params.projectId,
            sessionsJoinOperator: "and",
            sessionsPage: 1,
            sessionsPerPage: 10,
            sessionsSortDesc: true,
          },
        })
      );
    } catch {
      // Surfaced by the view's useQuery error state.
    }
  },
});

function PlayerProfilePage() {
  const { playerId, projectId } = Route.useParams();
  return <PlayerProfileView playerId={playerId} projectId={projectId} />;
}
