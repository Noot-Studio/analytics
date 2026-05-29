import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { FolderX } from "lucide-react";

import { ApiKeysSection } from "@/features/api-keys/components/organisms/api-keys-section";
import { orpc } from "@/utils/orpc";

import { EnvironmentBadge } from "../atoms/environment-badge";

export const ProjectSettingsView = ({ projectId }: { projectId: string }) => {
  const projectQuery = useQuery(
    orpc.projects.get.queryOptions({ input: { id: projectId } })
  );
  const project = projectQuery.data;
  const publishableKey =
    project?.apiKeys[0]?.publishableKey ?? "pk_your_publishable_key";

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
          Manage API keys and SDK integration for this project.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-sm">Environment</h2>
        <EnvironmentBadge environment={project.environment} />
      </section>

      <ApiKeysSection projectId={projectId} />

      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-sm">SDK setup</h2>
        <p className="text-muted-foreground text-sm">
          Add this to your s&amp;box game to start sending events.
        </p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-4 text-xs">
          <code>{`var analytics = new SboxAnalytics( "${publishableKey}" );
analytics.Track( "level_complete", new {
    level = "tutorial",
    duration = 42.5f,
} );`}</code>
        </pre>
      </section>
    </div>
  );
};
