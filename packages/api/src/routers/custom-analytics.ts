import { projectProcedure } from "../index";
import { queryConfigSchema } from "../query-builder";
import { runMetric } from "../run-metric";

export const customAnalyticsRouter = {
  query: projectProcedure
    .input(queryConfigSchema)
    .handler(async ({ context, input }) => {
      const { rows } = await runMetric(context.ch, input);
      return rows;
    }),
};
