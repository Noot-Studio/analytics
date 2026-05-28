import { Button } from "@sbox-analytics/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@sbox-analytics/ui/components/card";
import { Link } from "@tanstack/react-router";

interface ProjectCardProps {
  id: string;
  name: string;
  slug: string;
  apiKeyCount: number;
  createdAt: Date;
}

export function ProjectCard({ id, name, slug, apiKeyCount, createdAt }: ProjectCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{slug}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {apiKeyCount} API key{apiKeyCount !== 1 ? "s" : ""}
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard/projects/$projectId" params={{ projectId: id }}>
              View
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
