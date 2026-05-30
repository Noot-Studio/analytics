import { Button } from "@sbox-analytics/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@sbox-analytics/ui/components/sidebar";
import { IconArrowLeft } from "@tabler/icons-react";
import { useRouterState, Link } from "@tanstack/react-router";
import type * as React from "react";

import { orgNavMain, orgNavSecondary } from "@/components/dashboard/nav-config";
import { NavMain } from "@/components/dashboard/nav-main";
import { NavSecondary } from "@/components/dashboard/nav-secondary";
import { NavUser } from "@/components/dashboard/nav-user";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { projectNav } from "@/features/projects/components/molecules/project-nav";

const PROJECT_ROUTE_ID = "/dashboard/projects/$projectId";

export const AppSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const projectId = useRouterState({
    select: (state) => {
      const match = state.matches.find(
        (entry) => entry.routeId === PROJECT_ROUTE_ID
      );
      return (match?.params as { projectId?: string } | undefined)?.projectId;
    },
  });

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <OrgSwitcher />
        {projectId && (
          <Link to="/dashboard/projects">
            <Button variant="ghost" className="w-full justify-start" size="lg">
              <IconArrowLeft className="size-4" />
              Back to projects
            </Button>
          </Link>
        )}
      </SidebarHeader>
      <SidebarContent>
        {projectId ? (
          <NavMain items={projectNav(projectId)} />
        ) : (
          <NavMain items={orgNavMain} />
        )}
        <NavSecondary className="mt-auto" items={orgNavSecondary} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
};
