import { Button } from "@sbox-analytics/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { CreateProjectDialog } from "@/features/projects/components/molecules/create-project-dialog";
import { ProjectsList } from "@/features/projects/components/organisms/projects-list";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/projects/")({
  component: ProjectsIndexPage,
  // Passthrough so the projects data-table's page/sort/filter search params persist.
  validateSearch: (search: Record<string, unknown>) => search,
});

function ProjectsIndexPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    ...orpc.projects.create.mutationOptions(),
    onError: () => toast.error("Failed to create project"),
    onSuccess: () => {
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
      toast.success("Project created");
    },
  });

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted-foreground">
            Manage your game projects and their analytics.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create Project</Button>
      </div>
      <ProjectsList />
      <CreateProjectDialog
        isPending={createMutation.isPending}
        onCreate={(name, environment) =>
          createMutation.mutate({ environment, name })
        }
        onOpenChange={setCreateOpen}
        open={createOpen}
      />
    </div>
  );
}
