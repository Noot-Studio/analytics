import { Button } from "@sbox-analytics/ui/components/button";
import { IconArrowLeft } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

export const ProjectNavHeader = () => (
  <div className="flex flex-col gap-2 px-1 py-1.5">
    <Link to="/dashboard/projects">
      <Button variant="ghost" className="w-full justify-start" size="lg">
        <IconArrowLeft className="size-4" />
        Back to projects
      </Button>
    </Link>
  </div>
);
