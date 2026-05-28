import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/projects/$projectId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      params: { projectId: params.projectId },
      to: "/dashboard/projects/$projectId/overview",
    });
  },
});
