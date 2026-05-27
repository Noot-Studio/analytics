import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@sbox-analytics/ui/components/sidebar";
import {
  IconChartBar,
  IconDashboard,
  IconDatabase,
  IconFileWord,
  IconHelp,
  IconReport,
  IconSearch,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import type * as React from "react";

import { NavDocuments } from "@/components/dashboard/nav-documents";
import { NavMain } from "@/components/dashboard/nav-main";
import { NavSecondary } from "@/components/dashboard/nav-secondary";
import { NavUser } from "@/components/dashboard/nav-user";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";

const data = {
  documents: [
    { name: "Data Library", url: "/dashboard", icon: IconDatabase },
    { name: "Reports", url: "/dashboard", icon: IconReport },
    { name: "Word Assistant", url: "/dashboard", icon: IconFileWord },
  ],
  navMain: [
    { title: "Dashboard", url: "/dashboard", icon: IconDashboard },
    { title: "Analytics", url: "/dashboard", icon: IconChartBar },
    { title: "Team", url: "/dashboard", icon: IconUsers },
  ],
  navSecondary: [
    { title: "Settings", url: "/dashboard/settings", icon: IconSettings },
    { title: "Get Help", url: "/dashboard", icon: IconHelp },
    { title: "Search", url: "/dashboard", icon: IconSearch },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavDocuments items={data.documents} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
