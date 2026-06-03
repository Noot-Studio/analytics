import { createFileRoute } from "@tanstack/react-router";

import { PlayersView } from "@/features/analytics/components/organisms/players-view";
import { analyticsSearchSchema } from "@/features/analytics/lib/filters";

export const Route = createFileRoute("/dashboard/projects/$projectId/players")({
  component: PlayersPage,
  validateSearch: analyticsSearchSchema,
});

function PlayersPage() {
  const { projectId } = Route.useParams();
  return <PlayersView projectId={projectId} />;
}
