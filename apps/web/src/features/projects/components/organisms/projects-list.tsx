import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import type { SdkStatus } from "../atoms/sdk-status-badge";
import { ProjectCard } from "../molecules/project-card";

interface ApiKeyUsage {
  lastUsedAt: Date | string | null;
}

const deriveSdkStatus = (keys: ApiKeyUsage[]): SdkStatus => {
  if (keys.length === 0) {
    return "no-key";
  }
  if (keys.some((key) => key.lastUsedAt)) {
    return "connected";
  }
  return "awaiting";
};

const latestActivity = (keys: ApiKeyUsage[]): Date | null => {
  const times = keys
    .map((key) => key.lastUsedAt)
    .filter(
      (value): value is Date | string => value !== null && value !== undefined
    )
    .map((value) => new Date(value).getTime());
  return times.length > 0 ? new Date(Math.max(...times)) : null;
};

export const ProjectsList = () => {
  const listQuery = useQuery(orpc.projects.list.queryOptions());

  if (listQuery.isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Loading projects...
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <div className="py-8 text-center text-destructive">
        Failed to load projects.
      </div>
    );
  }

  const projects = listQuery.data ?? [];

  if (projects.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No projects yet. Create one to get started.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard
          apiKeyCount={project.apiKeys.length}
          environment={project.environment}
          id={project.id}
          key={project.id}
          lastActivityAt={latestActivity(project.apiKeys)}
          name={project.name}
          sdkStatus={deriveSdkStatus(project.apiKeys)}
          slug={project.slug}
        />
      ))}
    </div>
  );
};
