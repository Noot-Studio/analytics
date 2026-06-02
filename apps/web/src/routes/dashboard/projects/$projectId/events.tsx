import { createFileRoute } from "@tanstack/react-router";

import { EventsView } from "@/features/analytics/components/organisms/events-view";
import {
  analyticsSearchSchema,
  resolveRange,
} from "@/features/analytics/lib/filters";

export const Route = createFileRoute("/dashboard/projects/$projectId/events")({
  component: EventsPage,
  // Warm the default view (breakdown rollup + first page of the raw stream) on
  // hover/intent so navigation paints with data. Table page/sort/filter changes
  // happen after mount and resolve with keepPreviousData, so they aren't preloaded.
  loader: async ({ context, params, deps }) => {
    const { from, to } = resolveRange(deps);
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(
          context.orpc.insights.recent.queryOptions({
            input: {
              from,
              page: 1,
              perPage: 10,
              projectId: params.projectId,
              sortDesc: false,
              to,
            },
          })
        ),
        context.queryClient.ensureQueryData(
          context.orpc.insights.breakdown.queryOptions({
            input: {
              from: from.slice(0, 10),
              joinOperator: "and",
              projectId: params.projectId,
              sortDesc: true,
              to: to.slice(0, 10),
            },
          })
        ),
      ]);
    } catch {
      // Surfaced by the views' useQuery error states.
    }
  },
  loaderDeps: ({ search }) => ({
    from: search.from,
    range: search.range,
    to: search.to,
  }),
  validateSearch: analyticsSearchSchema,
});

function EventsPage() {
  const { projectId } = Route.useParams();
  return <EventsView projectId={projectId} />;
}
