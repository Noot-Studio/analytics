import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

import type { DashboardScopeValue } from "./use-dashboard-editor";

const ORG_WIDE = "__org__";
const PROJECTS_PAGE_SIZE = 100;

interface CardSourcePinArgs {
  open: boolean;
  projectId?: string;
  scope: DashboardScopeValue;
}

/**
 * Org-overview dashboards let an author pin a widget to one project as its data
 * source; project dashboards already have one. Owns the pin selector state, the
 * projects fetch behind it, and the project ids derived for built-in vs custom
 * widgets.
 */
export const useWidgetSourcePin = ({
  open,
  projectId,
  scope,
}: CardSourcePinArgs) => {
  const isOrgScope = scope === "OrgOverview";
  const [pin, setPin] = useState(ORG_WIDE);

  const { data: projects } = useQuery(
    orpc.projects.list.queryOptions({
      enabled: isOrgScope && open,
      input: { perPage: PROJECTS_PAGE_SIZE },
    })
  );

  // Select renders labels (not raw values) through the items map.
  const sourceItems: Record<string, string> = {
    [ORG_WIDE]: "Whole organization",
    ...Object.fromEntries(
      (projects?.rows ?? []).map((project) => [project.id, project.name])
    ),
  };

  const pinnedProjectId = pin === ORG_WIDE ? undefined : pin;
  // Custom widgets query project-scoped data; org dashboards must pin one.
  const customProjectId = projectId ?? pinnedProjectId;

  return {
    customProjectId,
    isOrgScope,
    pin,
    pinnedProjectId,
    setPin,
    sourceItems,
  };
};
