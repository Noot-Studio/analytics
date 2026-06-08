import { createFileRoute, useParams } from "@tanstack/react-router";

import { LiveEventsView } from "@/features/analytics/components/organisms/live-events-view";

const LivePage = () => {
  const { projectId } = useParams({
    from: "/dashboard/projects/$projectId/live",
  });
  return <LiveEventsView projectId={projectId} />;
};

export const Route = createFileRoute("/dashboard/projects/$projectId/live")({
  component: LivePage,
  // Warm the recent-events query the poller reuses so the first frame shows data
  // instead of a skeleton; the view's refetchInterval keeps it live after mount.
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        context.orpc.insights.recent.queryOptions({
          input: { perPage: 50, projectId: params.projectId },
        })
      );
    } catch {
      // Surfaced by the view's useQuery error state.
    }
  },
});
