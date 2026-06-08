import { createFileRoute, useParams } from "@tanstack/react-router";

import { PlayersView } from "@/features/analytics/components/organisms/players-view";
import { analyticsSearchSchema } from "@/features/analytics/lib/filters";

const PlayersPage = () => {
  const { projectId } = useParams({
    from: "/dashboard/projects/$projectId/players",
  });
  return <PlayersView projectId={projectId} />;
};

export const Route = createFileRoute("/dashboard/projects/$projectId/players")({
  component: PlayersPage,
  validateSearch: analyticsSearchSchema,
});
