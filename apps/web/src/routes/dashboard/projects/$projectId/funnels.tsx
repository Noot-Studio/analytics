import { createFileRoute, useParams } from "@tanstack/react-router";

import { FunnelsView } from "@/features/analytics/components/organisms/funnels-view";
import { analyticsSearchSchema } from "@/features/analytics/lib/filters";

const FunnelsPage = () => {
  const { projectId } = useParams({
    from: "/dashboard/projects/$projectId/funnels",
  });
  return <FunnelsView projectId={projectId} />;
};

export const Route = createFileRoute("/dashboard/projects/$projectId/funnels")({
  component: FunnelsPage,
  validateSearch: analyticsSearchSchema,
});
