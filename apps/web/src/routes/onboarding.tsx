import { createFileRoute, redirect } from "@tanstack/react-router";

import { OnboardingView } from "@/features/org/components/organisms/onboarding-view";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    const orgs = await authClient.organization.list();
    if (orgs.data?.length) {
      redirect({
        throw: true,
        to: "/dashboard",
      });
    }
  },
  component: OnboardingView,
});
