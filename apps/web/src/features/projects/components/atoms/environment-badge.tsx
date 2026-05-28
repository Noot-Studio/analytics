import { Badge } from "@sbox-analytics/ui/components/badge";

export type ProjectEnvironment = "Development" | "Staging" | "Production";

const ENV_VARIANT: Record<
  ProjectEnvironment,
  "default" | "secondary" | "outline"
> = {
  Development: "secondary",
  Production: "default",
  Staging: "outline",
};

export const EnvironmentBadge = ({
  environment,
}: {
  environment: ProjectEnvironment;
}) => <Badge variant={ENV_VARIANT[environment]}>{environment}</Badge>;
