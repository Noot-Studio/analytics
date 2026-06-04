import { createFileRoute } from "@tanstack/react-router";

import { TeamSection } from "@/features/teams/components/organisms/team-section";

const TeamsPage = () => (
  <div className="flex flex-col gap-8 p-4 lg:p-6">
    <div>
      <h1 className="font-semibold text-2xl">Team</h1>
      <p className="text-muted-foreground">
        View members of your organization and invite new ones.
      </p>
    </div>
    <TeamSection />
  </div>
);

export const Route = createFileRoute("/dashboard/teams")({
  component: TeamsPage,
});
