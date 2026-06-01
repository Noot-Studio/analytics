import {
  IconActivity,
  IconChartBar,
  IconDeviceGamepad2,
  IconFilter,
  IconListDetails,
  IconMap,
  IconSettings,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";

import type { NavItem } from "@/components/dashboard/nav-config";

export const projectNav = (projectId: string): NavItem[] => {
  const base = `/dashboard/projects/${projectId}`;
  return [
    {
      group: "Project",
      icon: IconChartBar,
      title: "Overview",
      url: `${base}/overview`,
    },
    {
      group: "Engagement",
      icon: IconUsers,
      title: "Players",
      url: `${base}/players`,
    },
    {
      group: "Engagement",
      icon: IconDeviceGamepad2,
      title: "Sessions",
      url: `${base}/sessions`,
    },
    {
      group: "Engagement",
      icon: IconUsersGroup,
      title: "Retention",
      url: `${base}/retention`,
    },
    {
      group: "Game",
      icon: IconMap,
      title: "Maps & Modes",
      url: `${base}/maps`,
    },
    {
      group: "Game",
      icon: IconFilter,
      title: "Funnels",
      url: `${base}/funnels`,
    },
    {
      group: "Data",
      icon: IconListDetails,
      title: "Events",
      url: `${base}/events`,
    },
    {
      group: "Data",
      icon: IconActivity,
      title: "Live Events",
      url: `${base}/live`,
    },
    {
      group: "Project",
      icon: IconSettings,
      title: "Settings",
      url: `${base}/settings`,
    },
  ];
};
