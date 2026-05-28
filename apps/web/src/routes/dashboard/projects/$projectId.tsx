import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/projects/$projectId")({
  component: ProjectLayout,
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        context.orpc.projects.get.queryOptions({
          input: { id: params.projectId },
        })
      );
    } catch {
      toast.error("Project not found");
      throw redirect({ to: "/dashboard/projects" });
    }
  },
});

function ProjectLayout() {
  return <Outlet />;
}
