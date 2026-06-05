import { assertProjectAccess } from "../access";
import { clickhouse } from "../clickhouse";
import { protectedProcedure } from "../index";
import { buildQuery, queryConfigSchema } from "../query-builder";

export const customAnalyticsRouter = {
  query: protectedProcedure
    .input(queryConfigSchema)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const { query, params } = buildQuery(input);

      const result = await clickhouse().query({
        format: "JSON",
        query,
        query_params: params,
      });

      const json = await result.json<Record<string, unknown>>();
      return json.data;
    }),
};
