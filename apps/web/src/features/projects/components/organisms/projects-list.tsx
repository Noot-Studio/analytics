import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { CreateProjectDialog } from "../molecules/create-project-dialog";
import { ProjectCard } from "../molecules/project-card";

export function ProjectsList() {
  const listQuery = useQuery(orpc.projects.list.queryOptions());

  if (listQuery.isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading projects...</div>;
  }

  if (listQuery.isError) {
    return <div className="py-8 text-center text-destructive">Failed to load projects.</div>;
  }

  const projects = listQuery.data ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard
          apiKeyCount={project._count.apiKeys}
          createdAt={project.createdAt}
          id={project.id}
          key={project.id}
          name={project.name}
          slug={project.slug}
        />
      ))}
    </div>
  );
}
