import { createFileRoute, useParams } from "@tanstack/react-router";

import { RetentionView } from "@/features/analytics/components/organisms/retention-view";
import { analyticsSearchSchema } from "@/features/analytics/lib/filters";

const RetentionPage = () => {
  const { projectId } = useParams({
    from: "/dashboard/projects/$projectId/retention",
  });
  return <RetentionView projectId={projectId} />;
};

export const Route = createFileRoute(
  "/dashboard/projects/$projectId/retention"
)({
  component: RetentionPage,
  validateSearch: analyticsSearchSchema,
});
