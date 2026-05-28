import {
  IconActivity,
  IconChartBar,
  IconListDetails,
  IconSettings,
} from "@tabler/icons-react";

import type { NavItem } from "@/components/dashboard/nav-config";

export const projectNav = (projectId: string): NavItem[] => {
  const base = `/dashboard/projects/${projectId}`;
  return [
    { icon: IconChartBar, title: "Overview", url: `${base}/overview` },
    { icon: IconListDetails, title: "Events", url: `${base}/events` },
    { icon: IconActivity, title: "Live Events", url: `${base}/live` },
    { icon: IconSettings, title: "Settings", url: `${base}/settings` },
  ];
};
