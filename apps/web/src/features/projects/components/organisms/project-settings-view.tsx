import { env } from "@sbox-analytics/env/web";
import { Button } from "@sbox-analytics/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Label } from "@sbox-analytics/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, FolderX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DeleteEntityDialog } from "@/components/delete-entity-dialog";
import { AlertsSection } from "@/features/alerts/components/organisms/alerts-section";
import { ApiKeysSection } from "@/features/api-keys/components/organisms/api-keys-section";
import { MetricsSection } from "@/features/dashboards/components/organisms/metrics-section";
import { orpc } from "@/utils/orpc";

import type { ProjectEnvironment } from "../atoms/environment-badge";

const ENVIRONMENTS: ProjectEnvironment[] = [
  "Development",
  "Staging",
  "Production",
];

export const ProjectSettingsView = ({ projectId }: { projectId: string }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const projectQuery = useQuery(
    orpc.projects.get.queryOptions({ input: { id: projectId } })
  );
  const project = projectQuery.data;

  const updateMutation = useMutation({
    ...orpc.projects.update.mutationOptions(),
    onError: () => toast.error("Failed to update environment"),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: orpc.projects.get.key({ input: { id: projectId } }),
      });
      queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
      toast.success("Environment updated");
    },
  });

  const deleteMutation = useMutation({
    ...orpc.projects.delete.mutationOptions(),
    onError: () => toast.error("Failed to delete project"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orpc.projects.list.key() });
      toast.success("Project deleted");
      navigate({ to: "/dashboard/projects" });
    },
  });

  if (projectQuery.isLoading) {
    return (
      <div className="flex flex-col gap-8 p-4 lg:p-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-4 lg:p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderX />
            </EmptyMedia>
            <EmptyTitle>Project not found</EmptyTitle>
            <EmptyDescription>
              This project may have been deleted or you no longer have access to
              it.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-4 lg:p-6">
      <div>
        <h1 className="font-semibold text-2xl">Settings</h1>
        <p className="text-muted-foreground">
          Manage metrics, API keys and SDK integration for this project.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <Label htmlFor="environment">Environment</Label>
        <Select
          disabled={updateMutation.isPending}
          onValueChange={(value) => {
            if (value && value !== project.environment) {
              updateMutation.mutate({
                environment: value as ProjectEnvironment,
                id: projectId,
              });
            }
          }}
          value={project.environment}
        >
          <SelectTrigger className="w-48" id="environment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENVIRONMENTS.map((environment) => (
              <SelectItem key={environment} value={environment}>
                {environment}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <MetricsSection projectId={projectId} />

      <AlertsSection scope={{ projectId }} />

      <ApiKeysSection projectId={projectId} />

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-sm">SDK setup</h2>
        <p className="text-muted-foreground text-sm">
          Follow the documentation to add the SDK to your s&amp;box game and
          start sending events.
        </p>
        <Button
          className="w-fit"
          render={
            <a
              aria-label="View SDK documentation"
              href={env.VITE_DOCS_URL}
              rel="noopener"
              target="_blank"
            />
          }
          variant="outline"
        >
          View SDK documentation
          <ExternalLink />
        </Button>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-destructive/40 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-destructive text-sm">
              Delete project
            </p>
            <p className="text-muted-foreground text-sm">
              Permanently delete {project.name} and all of its data.
            </p>
          </div>
          <Button
            onClick={() => setDeleteOpen(true)}
            size="sm"
            variant="destructive"
          >
            Delete
          </Button>
        </div>
      </section>

      <DeleteEntityDialog
        description={
          <>
            This permanently deletes {project.name}, including its API keys,
            metrics, and ingested events. This cannot be undone.
          </>
        }
        entityLabel="project"
        entityName={project.name}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate({ id: projectId })}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
      />
    </div>
  );
};
