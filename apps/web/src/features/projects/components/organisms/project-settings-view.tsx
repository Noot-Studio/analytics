import { useQuery } from "@tanstack/react-query";

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
        {project ? (
          <EnvironmentBadge environment={project.environment} />
        ) : (
          <span className="text-muted-foreground text-sm">Loading…</span>
        )}
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
