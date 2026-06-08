import { createFileRoute, useParams } from "@tanstack/react-router";

import { SessionProfileView } from "@/features/analytics/components/organisms/session-profile-view";

const SessionProfilePage = () => {
  const { projectId, sessionId } = useParams({
    from: "/dashboard/projects/$projectId/sessions_/$sessionId",
  });
  return <SessionProfileView projectId={projectId} sessionId={sessionId} />;
};

export const Route = createFileRoute(
  "/dashboard/projects/$projectId/sessions_/$sessionId"
)({
  component: SessionProfilePage,
  // Warm the profile aggregates and the default first page of the event log
  // on hover/intent so opening a session paints with data. Later table
  // paging/sort/filters hit only insights.sessionEvents. Errors surface via
  // the view's useQuery state.
  loader: async ({ context, params }) => {
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(
          context.orpc.insights.sessionProfile.queryOptions({
            input: {
              projectId: params.projectId,
              sessionId: params.sessionId,
            },
          })
        ),
        context.queryClient.ensureQueryData(
          context.orpc.insights.sessionEvents.queryOptions({
            input: {
              joinOperator: "and",
              page: 1,
              perPage: 20,
              projectId: params.projectId,
              sessionId: params.sessionId,
              sortDesc: false,
            },
          })
        ),
      ]);
    } catch {
      // Surfaced by the view's useQuery error state.
    }
  },
});
