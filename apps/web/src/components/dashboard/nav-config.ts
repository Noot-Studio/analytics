import { env } from "@sbox-analytics/env/web";
import {
  IconBook,
  IconDashboard,
  IconFolder,
  IconUsers,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";

export interface NavItem {
  title: string;
  url: string;
  icon?: Icon;
  external?: boolean;
}

export const orgNavMain: NavItem[] = [
  { icon: IconDashboard, title: "Dashboard", url: "/dashboard" },
  { icon: IconFolder, title: "Projects", url: "/dashboard/projects" },
  { icon: IconUsers, title: "Team", url: "/dashboard" },
];

export const orgNavSecondary: (NavItem & { icon: Icon })[] = [
  {
    external: true,
    icon: IconBook,
    title: "Documentation",
    url: env.VITE_DOCS_URL,
  },
];
