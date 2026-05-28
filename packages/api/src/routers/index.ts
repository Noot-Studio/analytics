import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { analyticsRouter } from "./analytics";
import { apiKeysRouter } from "./api-keys";
import { projectsRouter } from "./projects";

export const appRouter = {
  analytics: analyticsRouter,
  apiKeys: apiKeysRouter,
  projects: projectsRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
