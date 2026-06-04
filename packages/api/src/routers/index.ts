import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { analyticsRouter } from "./analytics";
import { apiKeysRouter } from "./api-keys";
import { customAnalyticsRouter } from "./custom-analytics";
import { dashboardsRouter } from "./dashboards";
import { introspectionRouter } from "./introspection";
import { orgAnalyticsRouter } from "./org-analytics";
import { projectsRouter } from "./projects";
import { teamsRouter } from "./teams";

export const appRouter = {
  apiKeys: apiKeysRouter,
  customAnalytics: customAnalyticsRouter,
  dashboards: dashboardsRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  insights: analyticsRouter,
  introspection: introspectionRouter,
  orgInsights: orgAnalyticsRouter,
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
  projects: projectsRouter,
  teams: teamsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
