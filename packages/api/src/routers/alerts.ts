import { ORPCError } from "@orpc/server";
import prisma, { AlertChannel, AlertMetric } from "@sbox-analytics/db";
import { z } from "zod";

import { assertProjectAccess } from "../access";
import { createAlertStore, createLiveDeliverer } from "../alerts/live";
import { evaluateProjectAlerts } from "../alerts/runner";
import { protectedProcedure } from "../index";

// Alert rules per project; matches the dashboard's unpaginated list cap.
const MAX_RULES_PER_PROJECT = 100;

const ruleFields = {
  channel: z.enum(AlertChannel),
  destination: z.string().min(1).max(500),
  metric: z.enum(AlertMetric),
  name: z.string().min(1).max(100),
  threshold: z.number().positive(),
};

// A destination only makes sense in the shape its channel expects — an email
// address for Email, a URL for Webhook. Validate it against the chosen channel.
const checkDestination = (
  data: { channel: AlertChannel; destination: string },
  ctx: z.RefinementCtx
): void => {
  const isEmail = data.channel === AlertChannel.Email;
  const schema = isEmail ? z.email() : z.url();
  if (!schema.safeParse(data.destination).success) {
    ctx.addIssue({
      code: "custom",
      message: `Destination must be a valid ${isEmail ? "email address" : "webhook URL"}`,
      path: ["destination"],
    });
  }
};

const createInput = z
  .object({ projectId: z.string().min(1), ...ruleFields })
  .superRefine(checkDestination);

const updateInput = z
  .object({ enabled: z.boolean(), id: z.string().min(1), ...ruleFields })
  .superRefine(checkDestination);

const ruleSelect = {
  channel: true,
  createdAt: true,
  destination: true,
  enabled: true,
  id: true,
  lastFiredAt: true,
  metric: true,
  name: true,
  threshold: true,
} as const;

// Load a rule's project for the ownership check; 404 if it doesn't exist.
const projectIdForRule = async (id: string): Promise<string> => {
  const rule = await prisma.alertRule.findFirst({
    select: { projectId: true },
    where: { id },
  });
  if (!rule) {
    throw new ORPCError("NOT_FOUND", { message: "Alert rule not found" });
  }
  return rule.projectId;
};

export const alertsRouter = {
  create: protectedProcedure
    .input(createInput)
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const ruleCount = await prisma.alertRule.count({
        where: { projectId: input.projectId },
      });
      if (ruleCount >= MAX_RULES_PER_PROJECT) {
        throw new ORPCError("FORBIDDEN", {
          message: `Projects are limited to ${MAX_RULES_PER_PROJECT} alert rules`,
        });
      }

      return prisma.alertRule.create({
        data: {
          channel: input.channel,
          destination: input.destination,
          metric: input.metric,
          name: input.name,
          projectId: input.projectId,
          threshold: input.threshold,
        },
        select: ruleSelect,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const projectId = await projectIdForRule(input.id);
      await assertProjectAccess(projectId, context.session.user.id);

      await prisma.alertRule.delete({ where: { id: input.id } });
      return { id: input.id };
    }),

  // Run threshold evaluation for the project now, delivering any breaches. The
  // MVP trigger — a scheduler can call the same path on an interval later.
  evaluate: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const firings = await evaluateProjectAlerts(
        {
          ch: context.ch,
          deliverer: createLiveDeliverer(),
          now: new Date(),
          store: createAlertStore(),
        },
        input.projectId
      );

      return { fired: firings.length, firings };
    }),

  list: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.projectId, context.session.user.id);

      const rows = await prisma.alertRule.findMany({
        orderBy: { createdAt: "desc" },
        select: ruleSelect,
        take: MAX_RULES_PER_PROJECT,
        where: { projectId: input.projectId },
      });

      return { rows };
    }),

  update: protectedProcedure
    .input(updateInput)
    .handler(async ({ context, input }) => {
      const projectId = await projectIdForRule(input.id);
      await assertProjectAccess(projectId, context.session.user.id);

      return prisma.alertRule.update({
        data: {
          channel: input.channel,
          destination: input.destination,
          enabled: input.enabled,
          metric: input.metric,
          name: input.name,
          threshold: input.threshold,
        },
        select: ruleSelect,
        where: { id: input.id },
      });
    }),
};
