import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTrigger,
} from "@sbox-analytics/ui/components/reui/stepper";
import { useNavigate } from "@tanstack/react-router";
import { BarChart3, CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import { OnboardingProjectStep } from "../molecules/onboarding-project-step";
import { OrgForm } from "../molecules/org-form";

type OnboardingStep = "org" | "project" | "keys";

const STEP_INDEX: Record<OnboardingStep, number> = {
  keys: 3,
  org: 1,
  project: 2,
};

export const OnboardingView = () => {
  const navigate = useNavigate();
  const { data: orgs, isPending } = authClient.useListOrganizations();
  const [isCreating, setIsCreating] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("org");

  useEffect(() => {
    if (step === "org" && !isPending && orgs && orgs.length > 0) {
      navigate({ to: "/dashboard" });
    }
  }, [isPending, orgs, navigate, step]);

  const handleCreateOrg = async (values: { name: string; slug: string }) => {
    setIsCreating(true);
    const { data, error } = await authClient.organization.create({
      name: values.name,
      slug: values.slug,
    });
    if (error) {
      toast.error(error.message ?? "Failed to create organization");
      setIsCreating(false);
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    setIsCreating(false);
    setStep("project");
  };

  const activeStep = STEP_INDEX[step];

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-8 items-center justify-center rounded-md">
            <BarChart3 aria-hidden="true" className="size-6" />
          </div>
        </div>
        <Stepper
          className="w-full"
          indicators={{ completed: <CheckIcon className="size-4" /> }}
          value={activeStep}
        >
          <StepperNav>
            <StepperItem step={1}>
              <StepperTrigger>
                <StepperIndicator>1</StepperIndicator>
              </StepperTrigger>
              <StepperSeparator />
            </StepperItem>
            <StepperItem step={2}>
              <StepperTrigger>
                <StepperIndicator>2</StepperIndicator>
              </StepperTrigger>
              <StepperSeparator />
            </StepperItem>
            <StepperItem step={3}>
              <StepperTrigger>
                <StepperIndicator>3</StepperIndicator>
              </StepperTrigger>
            </StepperItem>
          </StepperNav>
        </Stepper>
        {step === "org" ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2 text-center">
              <h1 className="font-bold text-xl">Create your organization</h1>
              <p className="text-muted-foreground text-sm">
                Set up your workspace to get started
              </p>
            </div>
            <OrgForm
              isLoading={isCreating}
              onSubmit={handleCreateOrg}
              submitLabel="Create Organization"
            />
          </div>
        ) : (
          <OnboardingProjectStep
            onComplete={() => navigate({ to: "/dashboard" })}
            onKeysCreated={() => setStep("keys")}
          />
        )}
      </div>
    </div>
  );
};
