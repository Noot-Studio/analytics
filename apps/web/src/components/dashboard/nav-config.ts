import {
  IconDashboard,
  IconFolder,
  IconHelp,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";

export interface NavItem {
  title: string;
  url: string;
  icon?: Icon;
}

export const orgNavMain: NavItem[] = [
  { icon: IconDashboard, title: "Dashboard", url: "/dashboard" },
  { icon: IconFolder, title: "Projects", url: "/dashboard/projects" },
  { icon: IconUsers, title: "Team", url: "/dashboard" },
];

export const orgNavSecondary: (NavItem & { icon: Icon })[] = [
  { icon: IconSettings, title: "Settings", url: "/dashboard/settings" },
  { icon: IconHelp, title: "Get Help", url: "/dashboard" },
];
