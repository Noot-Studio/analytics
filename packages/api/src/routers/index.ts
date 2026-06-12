import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { alertsRouter } from "./alerts";
import { analyticsRouter } from "./analytics";
import { apiKeysRouter } from "./api-keys";
import { customAnalyticsRouter } from "./custom-analytics";
import { dashboardsRouter } from "./dashboards";
import { imagesRouter } from "./images";
import { introspectionRouter } from "./introspection";
import { metricsRouter } from "./metrics";
import { orgAnalyticsRouter } from "./org-analytics";
import { projectsRouter } from "./projects";
import { teamsRouter } from "./teams";
import { usageRouter } from "./usage";
import { widgetsRouter } from "./widgets";

export const appRouter = {
  alerts: alertsRouter,
  apiKeys: apiKeysRouter,
  customAnalytics: customAnalyticsRouter,
  dashboards: dashboardsRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  images: imagesRouter,
  insights: analyticsRouter,
  introspection: introspectionRouter,
  metrics: metricsRouter,
  orgInsights: orgAnalyticsRouter,
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
  projects: projectsRouter,
  teams: teamsRouter,
  usage: usageRouter,
  widgets: widgetsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
