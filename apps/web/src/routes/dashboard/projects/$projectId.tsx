import { Button } from "@sbox-analytics/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";

import { ApiKeysSection } from "@/features/api-keys/components/organisms/api-keys-section";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/projects/$projectId")({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const projectQuery = useQuery(
    orpc.projects.get.queryOptions({ id: projectId })
  );

  if (projectQuery.isLoading) {
    return <div className="p-4 lg:p-6">Loading project...</div>;
  }

  if (projectQuery.isError || !projectQuery.data) {
    return <div className="p-4 lg:p-6 text-destructive">Project not found.</div>;
  }

  const project = projectQuery.data;

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/projects">← Back</Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-muted-foreground">{project.slug}</p>
      </div>
      <ApiKeysSection projectId={projectId} />
    </div>
  );
}
