import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
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
  pendingComponent: ProjectLayoutPending,
});

function ProjectLayout() {
  return <Outlet />;
}

function ProjectLayoutPending() {
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
