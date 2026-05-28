import { Button } from "@sbox-analytics/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sbox-analytics/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sbox-analytics/ui/components/table";
import { IconDotsVertical } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

import { EnvironmentBadge } from "../atoms/environment-badge";

export const ProjectsList = () => {
  const navigate = useNavigate();
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Environment</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell>
              <Link
                className="font-medium underline underline-offset-4 hover:text-foreground"
                params={{ projectId: project.id }}
                to="/dashboard/projects/$projectId"
              >
                {project.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {project.slug}
            </TableCell>
            <TableCell>
              <EnvironmentBadge environment={project.environment} />
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      className="flex size-8 data-[state=open]:bg-muted"
                      size="icon"
                      variant="ghost"
                    />
                  }
                >
                  <IconDotsVertical />
                  <span className="sr-only">Open menu</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuItem
                    onClick={() =>
                      navigate({
                        params: { projectId: project.id },
                        to: "/dashboard/projects/$projectId",
                      })
                    }
                  >
                    View
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      navigate({
                        params: { projectId: project.id },
                        to: "/dashboard/projects/$projectId/settings",
                      })
                    }
                  >
                    Edit
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
