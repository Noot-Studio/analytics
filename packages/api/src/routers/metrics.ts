import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import {
  assertOrgAccess,
  assertProjectAccess,
  requireActiveOrg,
} from "../access";
import { protectedProcedure } from "../index";
import type { MetricSnapshot } from "../metrics";
import {
  metricConfigSchema,
  metricInputSchema,
  metricViewSchema,
} from "../metrics";
import { buildQuery } from "../query-builder";
import { runQuery } from "../run-query";

// Metrics resolve their org like the dashboard library did: explicit org id,
// via a project, or the session's active organization.
const orgScopeInput = z.object({
  organizationId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});

interface SessionContext {
  session: {
    session: { activeOrganizationId?: string | null };
    user: { id: string };
  };
}

const resolveOrg = async (
  context: SessionContext,
  input: z.infer<typeof orgScopeInput>
): Promise<string> => {
  if (input.projectId) {
    return await assertProjectAccess(input.projectId, context.session.user.id);
  }
  const organizationId = input.organizationId ?? requireActiveOrg(context);
  await assertOrgAccess(organizationId, context.session.user.id);
  return organizationId;
};

const metricSelect = {
  config: true,
  description: true,
  id: true,
  name: true,
  updatedAt: true,
} as const;

interface MetricRow {
  config: unknown;
  description: string | null;
  id: string;
  name: string;
  updatedAt: Date;
}

const toSnapshot = (metric: MetricRow): MetricSnapshot => ({
  config: metricConfigSchema.parse(metric.config),
  description: metric.description,
  id: metric.id,
  name: metric.name,
  updatedAt: metric.updatedAt.toISOString(),
});

const previewInput = z.object({
  config: metricConfigSchema,
  projectId: z.string().min(1),
  timeRange: z.object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  }),
  // Shape params (granularity/groupBy/limit) come from the consumer, not the
  // metric — for the builder, this is the preview's chosen view.
  view: metricViewSchema,
});

export const metricsRouter = {
  create: protectedProcedure
    .input(orgScopeInput.extend(metricInputSchema.shape))
    .handler(async ({ context, input }) => {
      const organizationId = await resolveOrg(context, input);

      const metric = await prisma.metric.create({
        data: {
          config: input.config,
          description: input.description,
          name: input.name,
          organizationId,
        },
        select: metricSelect,
      });
      return toSnapshot(metric);
    }),

  delete: protectedProcedure
    .input(orgScopeInput.extend({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = await resolveOrg(context, input);

      const { count } = await prisma.metric.deleteMany({
        where: { id: input.id, organizationId },
      });
      if (count === 0) {
        throw new ORPCError("NOT_FOUND", { message: "Metric not found" });
      }
      return { id: input.id };
    }),

  get: protectedProcedure
    .input(orgScopeInput.extend({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = await resolveOrg(context, input);

      const metric = await prisma.metric.findFirst({
        select: metricSelect,
        where: { id: input.id, organizationId },
      });
      if (!metric) {
        throw new ORPCError("NOT_FOUND", { message: "Metric not found" });
      }
      return toSnapshot(metric);
    }),

  list: protectedProcedure
    .input(orgScopeInput)
    .handler(async ({ context, input }) => {
      const organizationId = await resolveOrg(context, input);

      const metrics = await prisma.metric.findMany({
        orderBy: { createdAt: "asc" },
        select: metricSelect,
        where: { organizationId },
      });
      return metrics.map(toSnapshot);
    }),

  /**
   * Run a (possibly unsaved) metric config against one project and time range.
   * Returns the rows plus the generated SQL so the builder can show exactly
   * what will execute.
   */
  preview: protectedProcedure
    .input(previewInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const built = buildQuery({
        ...input.config,
        ...input.view,
        projectId: input.projectId,
        timeRange: input.timeRange,
      });
      const rows = await runQuery(
        context.ch,
        built,
        z.record(z.string(), z.unknown())
      );
      return { rows, sql: built.query };
    }),

  update: protectedProcedure
    .input(
      orgScopeInput
        .extend({ id: z.string().min(1) })
        .extend(metricInputSchema.partial().shape)
    )
    .handler(async ({ context, input }) => {
      const organizationId = await resolveOrg(context, input);

      const { count } = await prisma.metric.updateMany({
        data: {
          ...(input.config ? { config: input.config } : {}),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.name ? { name: input.name } : {}),
        },
        where: { id: input.id, organizationId },
      });
      if (count === 0) {
        throw new ORPCError("NOT_FOUND", { message: "Metric not found" });
      }

      const metric = await prisma.metric.findFirstOrThrow({
        select: metricSelect,
        where: { id: input.id, organizationId },
      });
      return toSnapshot(metric);
    }),
};
