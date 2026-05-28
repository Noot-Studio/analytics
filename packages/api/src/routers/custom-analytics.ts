import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";

import { clickhouse } from "../clickhouse";
import { protectedProcedure } from "../index";
import { buildQuery, queryConfigSchema } from "../query-builder";

const assertProjectAccess = async (
  projectId: string,
  userId: string
): Promise<void> => {
  const project = await prisma.project.findFirst({
    select: { organizationId: true },
    where: { id: projectId },
  });

  if (!project) {
    throw new ORPCError("FORBIDDEN", { message: "Project not found" });
  }

  const membership = await prisma.member.findFirst({
    select: { id: true },
    where: {
      organizationId: project.organizationId,
      userId,
    },
  });

  if (!membership) {
    throw new ORPCError("FORBIDDEN", { message: "Project not accessible" });
  }
};

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
