import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";

import { analyticsSearchSchema } from "@/features/analytics/lib/filters";
import { DashboardGrid } from "@/features/dashboards/components/organisms/dashboard-grid";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndex,
  errorComponent: DashboardError,
  pendingComponent: DashboardPending,
  validateSearch: analyticsSearchSchema,
});

function DashboardIndex() {
  // The active organization is set client-side after sign-in (OrgSwitcher
  // defaults to the first org), so wait for it before any org-scoped query.
  // Keying by org id remounts the grid — and its caches — on org switch.
  const { data: activeOrg, isPending } = authClient.useActiveOrganization();

  if (isPending || !activeOrg) {
    return <DashboardPending />;
  }

  return (
    <DashboardGrid
      key={activeOrg.id}
      organizationId={activeOrg.id}
      scope="OrgOverview"
    />
  );
}

function DashboardPending() {
  const cardKeys = Array.from({ length: 3 }, (_, index) => `card-${index}`);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <Skeleton className="h-7 w-40" />
      <div className="grid gap-4 md:grid-cols-3">
        {cardKeys.map((key) => (
          <Skeleton className="h-24 w-full" key={key} />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function DashboardError() {
  return (
    <div className="p-4 text-destructive lg:p-6">Failed to load dashboard.</div>
  );
}
