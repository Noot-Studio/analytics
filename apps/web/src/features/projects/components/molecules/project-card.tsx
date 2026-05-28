import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sbox-analytics/ui/components/card";
import { Link } from "@tanstack/react-router";

interface ProjectCardProps {
  id: string;
  name: string;
  slug: string;
  apiKeyCount: number;
  createdAt: Date;
}

export const ProjectCard = ({
  id,
  name,
  slug,
  apiKeyCount,
}: ProjectCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>{name}</CardTitle>
      <CardDescription>{slug}</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {apiKeyCount} API key{apiKeyCount === 1 ? "" : "s"}
        </div>
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
