import { z } from "zod";

import { assertProjectAccess } from "../access";
import { protectedProcedure } from "../index";
import { buildQuery, queryConfigSchema } from "../query-builder";
import { runQuery } from "../run-query";

export const customAnalyticsRouter = {
  query: protectedProcedure
    .input(queryConfigSchema)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      // The shape is user-defined (arbitrary aggregation/group-by), so rows pass
      // through a permissive object schema rather than a fixed row schema.
      return runQuery(
        context.ch,
        buildQuery(input),
        z.record(z.string(), z.unknown())
      );
    }),
};
