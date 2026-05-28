import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sbox-analytics/ui/components/card";
import { Link } from "@tanstack/react-router";

import { RelativeTime } from "@/features/analytics/components/atoms/relative-time";

import { EnvironmentBadge } from "../atoms/environment-badge";
import type { ProjectEnvironment } from "../atoms/environment-badge";
import { SdkStatusBadge } from "../atoms/sdk-status-badge";
import type { SdkStatus } from "../atoms/sdk-status-badge";

interface ProjectCardProps {
  id: string;
  name: string;
  slug: string;
  environment: ProjectEnvironment;
  apiKeyCount: number;
  sdkStatus: SdkStatus;
  lastActivityAt: Date | string | null;
}

export const ProjectCard = ({
  id,
  name,
  slug,
  environment,
  apiKeyCount,
  sdkStatus,
  lastActivityAt,
}: ProjectCardProps) => (
  <Card>
    <CardHeader>
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle>{name}</CardTitle>
          <CardDescription>{slug}</CardDescription>
        </div>
        <EnvironmentBadge environment={environment} />
      </div>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SdkStatusBadge status={sdkStatus} />
        <span className="text-sm text-muted-foreground">
          {apiKeyCount} API key{apiKeyCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Last activity: <RelativeTime date={lastActivityAt} />
        </span>
        <Link
          className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-colors hover:bg-muted hover:text-foreground"
          params={{ projectId: id }}
          to="/dashboard/projects/$projectId"
        >
          View
        </Link>
      </div>
    </CardContent>
  </Card>
);
