import { createFileRoute } from "@tanstack/react-router";

import { SessionProfileView } from "@/features/analytics/components/organisms/session-profile-view";

export const Route = createFileRoute(
  "/dashboard/projects/$projectId/sessions_/$sessionId"
)({
  component: SessionProfilePage,
  // Warm the default profile (first page of events) on hover/intent so opening
  // a session paints with data. Event table paging/sort/filters resolve after
  // mount with keepPreviousData. Errors surface via the view's useQuery state.
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        context.orpc.insights.sessionProfile.queryOptions({
          input: {
            eventsJoinOperator: "and",
            eventsPage: 1,
            eventsPerPage: 20,
            projectId: params.projectId,
            sessionId: params.sessionId,
          },
        })
      );
    } catch {
      // Surfaced by the view's useQuery error state.
    }
  },
});

function SessionProfilePage() {
  const { projectId, sessionId } = Route.useParams();
  return <SessionProfileView projectId={projectId} sessionId={sessionId} />;
}
