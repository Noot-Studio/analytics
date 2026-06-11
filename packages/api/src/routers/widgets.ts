import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import { requireWriteRole, resolveOrgScope } from "../access";
import { protectedProcedure } from "../index";
import type { WidgetSnapshot } from "../widgets";
import { widgetConfigSchema, widgetInputSchema } from "../widgets";

// Widgets resolve their org the same way metrics do: explicit org id, via a
// project, or the session's active organization.
const orgScopeInput = z.object({
  organizationId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});

const widgetSelect = {
  config: true,
  id: true,
  metricId: true,
  name: true,
  updatedAt: true,
} as const;

interface WidgetRow {
  config: unknown;
  id: string;
  metricId: string;
  name: string;
  updatedAt: Date;
}

const toSnapshot = (widget: WidgetRow): WidgetSnapshot => ({
  config: widgetConfigSchema.parse(widget.config),
  id: widget.id,
  metricId: widget.metricId,
  name: widget.name,
  updatedAt: widget.updatedAt.toISOString(),
});

export const widgetsRouter = {
  create: protectedProcedure
    .input(orgScopeInput.extend(widgetInputSchema.shape))
    .handler(async ({ context, input }) => {
      const { organizationId, role } = await resolveOrgScope(context, input);
      requireWriteRole(role);

      const metric = await prisma.metric.findFirst({
        select: { id: true },
        where: { id: input.metricId, organizationId },
      });
      if (!metric) {
        throw new ORPCError("NOT_FOUND", { message: "Metric not found" });
      }

      const widget = await prisma.widget.create({
        data: {
          config: input.config,
          metricId: input.metricId,
          name: input.name,
          organizationId,
        },
        select: widgetSelect,
      });
      return toSnapshot(widget);
    }),

  delete: protectedProcedure
    .input(orgScopeInput.extend({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const { organizationId, role } = await resolveOrgScope(context, input);
      requireWriteRole(role);

      const { count } = await prisma.widget.deleteMany({
        where: { id: input.id, organizationId },
      });
      if (count === 0) {
        throw new ORPCError("NOT_FOUND", { message: "Widget not found" });
      }
      return { id: input.id };
    }),

  list: protectedProcedure
    .input(orgScopeInput)
    .handler(async ({ context, input }) => {
      const { organizationId } = await resolveOrgScope(context, input);

      const widgets = await prisma.widget.findMany({
        orderBy: { createdAt: "asc" },
        select: widgetSelect,
        where: { organizationId },
      });
      return widgets.map(toSnapshot);
    }),
};
