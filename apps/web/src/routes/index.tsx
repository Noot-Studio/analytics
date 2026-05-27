import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    redirect({
      throw: true,
      to: "/dashboard",
    });
  },
  component: () => null,
});
