import { createFileRoute, useParams } from "@tanstack/react-router";

import { MapsView } from "@/features/analytics/components/organisms/maps-view";
import { analyticsSearchSchema } from "@/features/analytics/lib/filters";

const MapsPage = () => {
  const { projectId } = useParams({
    from: "/dashboard/projects/$projectId/maps",
  });
  return <MapsView projectId={projectId} />;
};

export const Route = createFileRoute("/dashboard/projects/$projectId/maps")({
  component: MapsPage,
  validateSearch: analyticsSearchSchema,
});
