import { createFileRoute, useParams } from "@tanstack/react-router";

import { SpatialView } from "@/features/analytics/components/organisms/spatial-view";
import { analyticsSearchSchema } from "@/features/analytics/lib/filters";

const SpatialPage = () => {
  const { projectId } = useParams({
    from: "/dashboard/projects/$projectId/spatial",
  });
  return <SpatialView projectId={projectId} />;
};

export const Route = createFileRoute("/dashboard/projects/$projectId/spatial")({
  component: SpatialPage,
  validateSearch: analyticsSearchSchema,
});
