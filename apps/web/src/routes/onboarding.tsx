import { createFileRoute } from "@tanstack/react-router";

import { OnboardingView } from "@/features/org/components/organisms/onboarding-view";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingView,
});
