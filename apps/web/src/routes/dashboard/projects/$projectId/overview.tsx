import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { createFileRoute, useParams } from "@tanstack/react-router";

import {
  analyticsSearchSchema,
  resolveRange,
} from "@/features/analytics/lib/filters";
import { DashboardGrid } from "@/features/dashboards/components/organisms/dashboard-grid";

const OverviewPage = () => {
  const { projectId } = useParams({
    from: "/dashboard/projects/$projectId/overview",
  });
  return <DashboardGrid projectId={projectId} scope="ProjectOverview" />;
};

const OverviewPending = () => {
  const cardKeys = Array.from({ length: 3 }, (_, index) => `widget-${index}`);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cardKeys.map((key) => (
          <Skeleton className="h-24 w-full" key={key} />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
};

const OverviewError = () => (
  <div className="p-4 text-destructive lg:p-6">Failed to load analytics.</div>
);

export const Route = createFileRoute("/dashboard/projects/$projectId/overview")(
  {
    component: OverviewPage,
    errorComponent: OverviewError,
    // Warm the cache before the component mounts. With `defaultPreload: "intent"`
    // this fires on hover, so by click the data is already cached and the view's
    // useSuspenseQuery resolves synchronously — no skeleton on navigation.
    loader: ({ context, params, deps }) => {
      const { from, to } = resolveRange(deps);
      return Promise.all([
        context.queryClient.ensureQueryData(
          context.orpc.dashboards.get.queryOptions({
            input: {
              projectId: params.projectId,
              scope: "ProjectOverview",
            },
          })
        ),
        // Default built-in widgets all read from this one rollup query.
        context.queryClient.ensureQueryData(
          context.orpc.insights.daily.queryOptions({
            input: {
              from: from.slice(0, 10),
              projectId: params.projectId,
              to: to.slice(0, 10),
            },
          })
        ),
      ]);
    },
    // Re-run the loader (and preload-on-intent) whenever the time range changes.
    loaderDeps: ({ search }) => ({
      from: search.from,
      range: search.range,
      to: search.to,
    }),
    pendingComponent: OverviewPending,
    validateSearch: analyticsSearchSchema,
  }
);
