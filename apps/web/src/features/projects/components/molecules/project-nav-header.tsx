import { IconArrowLeft } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

import { EnvironmentBadge } from "../atoms/environment-badge";

export const ProjectNavHeader = ({ projectId }: { projectId: string }) => {
  const projectQuery = useQuery(
    orpc.projects.get.queryOptions({ input: { id: projectId } })
  );
  const project = projectQuery.data;

  return (
    <div className="flex flex-col gap-2 px-1 py-1.5">
      <Link
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        to="/dashboard/projects"
      >
        <IconArrowLeft className="size-4" />
        Back to projects
      </Link>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-semibold">
          {project?.name ?? "Loading…"}
        </span>
        {project === undefined ? null : (
          <EnvironmentBadge environment={project.environment} />
        )}
      </div>
    </div>
  );
};
