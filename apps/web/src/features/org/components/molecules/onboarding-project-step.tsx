import { Button } from "@sbox-analytics/ui/components/button";
import { Input } from "@sbox-analytics/ui/components/input";
import { Label } from "@sbox-analytics/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { useMutation } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { SecretReveal } from "@/features/api-keys/components/atoms/secret-reveal";
import type { ProjectEnvironment } from "@/features/projects/components/atoms/environment-badge";
import { orpc } from "@/utils/orpc";

const ENVIRONMENTS: ProjectEnvironment[] = [
  "Development",
  "Staging",
  "Production",
];

interface CreatedKey {
  publishableKey: string;
  secretKey: string;
}

interface OnboardingProjectStepProps {
  onComplete: () => void;
  onKeysCreated: () => void;
}

export const OnboardingProjectStep = ({
  onComplete,
  onKeysCreated,
}: OnboardingProjectStepProps) => {
  const [name, setName] = useState("");
  const [environment, setEnvironment] =
    useState<ProjectEnvironment>("Development");
  const [createdKey, setCreatedKey] = useState<CreatedKey | null>(null);

  const createProject = useMutation(orpc.projects.create.mutationOptions());
  const createKey = useMutation(orpc.apiKeys.create.mutationOptions());

  const isCreating = createProject.isPending || createKey.isPending;

  useEffect(() => {
    if (!createdKey) {
      return;
    }
    const origin = { y: 0.6 };
    confetti({ origin, particleCount: 120, spread: 70 });
    confetti({ origin, particleCount: 60, spread: 100, startVelocity: 45 });
  }, [createdKey]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    let project: { id: string };
    try {
      project = await createProject.mutateAsync({
        environment,
        name: trimmedName,
      });
    } catch {
      toast.error("Failed to create project");
      return;
    }

    try {
      const key = await createKey.mutateAsync({
        name: "Default",
        projectId: project.id,
      });
      setCreatedKey({
        publishableKey: key.publishableKey,
        secretKey: key.secretKey,
      });
      onKeysCreated();
    } catch {
      toast.error("Failed to create API key");
    }
  };

  if (createdKey) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="font-bold text-xl">You&apos;re all set</h1>
          <p className="text-muted-foreground text-sm">
            Use these keys to connect your s&amp;box game to the Ingest API.
          </p>
        </div>
        <SecretReveal
          publishableKey={createdKey.publishableKey}
          secretKey={createdKey.secretKey}
        />
        <div className="flex flex-col gap-2">
          <h2 className="font-medium text-sm">SDK setup</h2>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-4 text-xs">
            <code>{`var analytics = new SboxAnalytics( "${createdKey.publishableKey}" );
analytics.Track( "level_complete", new {
    level = "tutorial",
    duration = 42.5f,
} );`}</code>
          </pre>
        </div>
        <Button onClick={onComplete} type="button">
          Go to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-bold text-xl">Create your first project</h1>
        <p className="text-muted-foreground text-sm">
          Add a project and grab an API key to connect your game.
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="project-name">Project Name</Label>
          <Input
            id="project-name"
            onChange={(event) => setName(event.target.value)}
            placeholder="My Awesome Game"
            value={name}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="environment">Environment</Label>
          <Select
            onValueChange={(value) => {
              if (value) {
                setEnvironment(value as ProjectEnvironment);
              }
            }}
            value={environment}
          >
            <SelectTrigger id="environment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENVIRONMENTS.map((env) => (
                <SelectItem key={env} value={env}>
                  {env}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={isCreating || !name.trim()} type="submit">
          {isCreating ? "Creating..." : "Create project"}
        </Button>
      </form>
    </div>
  );
};
