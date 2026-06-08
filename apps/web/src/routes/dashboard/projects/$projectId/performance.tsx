import { createFileRoute, useParams } from "@tanstack/react-router";

import { PerformanceView } from "@/features/analytics/components/organisms/performance-view";
import {
  analyticsSearchSchema,
  resolveRange,
} from "@/features/analytics/lib/filters";

const PerformancePage = () => {
  const { projectId } = useParams({
    from: "/dashboard/projects/$projectId/performance",
  });
  return <PerformanceView projectId={projectId} />;
};

export const Route = createFileRoute(
  "/dashboard/projects/$projectId/performance"
)({
  component: PerformancePage,
  // Warm the default (unfiltered) view on hover/intent so navigation paints with
  // data instead of a skeleton. Map-table filters/sorts are user-applied after
  // mount and resolve client-side with keepPreviousData — no need to preload them.
  // Errors don't block navigation; the view renders its own error state.
  loader: async ({ context, params, deps }) => {
    const { from, to } = resolveRange(deps);
    try {
      await context.queryClient.ensureQueryData(
        context.orpc.insights.performance.queryOptions({
          input: {
            from: from.slice(0, 10),
            mapJoinOperator: "and",
            mapSortDesc: false,
            projectId: params.projectId,
            to: to.slice(0, 10),
          },
        })
      );
    } catch {
      // Surfaced by the view's useQuery error state.
    }
  },
  loaderDeps: ({ search }) => ({
    from: search.from,
    range: search.range,
    to: search.to,
  }),
  validateSearch: analyticsSearchSchema,
});
