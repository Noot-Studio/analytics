import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import { requireWriteRole, resolveOrgScope } from "../access";
import { createAlertNotifier } from "../alerts/delivery";
import { runAlerts } from "../alerts/runner";
import type { ResolvedAlertRule } from "../alerts/runner";
import type { AlertRuleSnapshot } from "../alerts/schema";
import { alertRuleInputSchema } from "../alerts/schema";
import { protectedProcedure } from "../index";
import { metricConfigSchema } from "../metrics";

// Alerts resolve their scope the same way metrics do: an explicit project makes
// the rule project-scoped; otherwise it's an org-wide rule over the active (or
// explicit) organization.
const scopeInput = z.object({
  organizationId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});

const alertSelect = {
  channel: true,
  destination: true,
  enabled: true,
  id: true,
  lastFiredAt: true,
  metric: { select: { config: true, name: true } },
  metricId: true,
  name: true,
  operator: true,
  projectId: true,
  threshold: true,
  updatedAt: true,
  window: true,
} as const;

interface AlertRow {
  channel: AlertRuleSnapshot["channel"];
  destination: string;
  enabled: boolean;
  id: string;
  lastFiredAt: Date | null;
  metric: { config: unknown; name: string };
  metricId: string;
  name: string;
  operator: AlertRuleSnapshot["operator"];
  projectId: string | null;
  threshold: number;
  updatedAt: Date;
  window: AlertRuleSnapshot["window"];
}

const toSnapshot = (rule: AlertRow): AlertRuleSnapshot => ({
  channel: rule.channel,
  destination: rule.destination,
  enabled: rule.enabled,
  id: rule.id,
  lastFiredAt: rule.lastFiredAt?.toISOString() ?? null,
  metricId: rule.metricId,
  metricName: rule.metric.name,
  name: rule.name,
  operator: rule.operator,
  projectId: rule.projectId,
  threshold: rule.threshold,
  updatedAt: rule.updatedAt.toISOString(),
  window: rule.window,
});

// Guards that a metric id belongs to the rule's org, so a rule can't be
// pointed at another org's metric.
const assertMetricInOrg = async (
  metricId: string,
  organizationId: string
): Promise<void> => {
  const metric = await prisma.metric.findFirst({
    select: { id: true },
    where: { id: metricId, organizationId },
  });
  if (!metric) {
    throw new ORPCError("BAD_REQUEST", { message: "Metric not found" });
  }
};

// Project rules are filtered by project; org rules are the org's project-less
// rules. Both pin organizationId so a stray id can't reach another org's rules.
const scopeWhere = (
  input: z.infer<typeof scopeInput>,
  organizationId: string
) =>
  input.projectId
    ? { organizationId, projectId: input.projectId }
    : { organizationId, projectId: null };

// A webhook destination must be a URL; an email destination must be an address.
// Enforced here rather than as a zod refine so the input schema stays composable.
const assertDestination = (
  channel: AlertRuleSnapshot["channel"],
  destination: string
): void => {
  const valid =
    channel === "Webhook"
      ? z.url().safeParse(destination).success
      : z.email().safeParse(destination).success;
  if (!valid) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        channel === "Webhook"
          ? "Webhook destination must be a valid URL"
          : "Email destination must be a valid email address",
    });
  }
};

export const alertsRouter = {
  create: protectedProcedure
    .input(scopeInput.extend(alertRuleInputSchema.shape))
    .handler(async ({ context, input }) => {
      const { organizationId, role } = await resolveOrgScope(context, input);
      requireWriteRole(role);
      assertDestination(input.channel, input.destination);
      await assertMetricInOrg(input.metricId, organizationId);

      const rule = await prisma.alertRule.create({
        data: {
          channel: input.channel,
          destination: input.destination,
          enabled: input.enabled,
          metricId: input.metricId,
          name: input.name,
          operator: input.operator,
          organizationId,
          projectId: input.projectId ?? null,
          threshold: input.threshold,
          window: input.window,
        },
        select: alertSelect,
      });
      return toSnapshot(rule);
    }),

  delete: protectedProcedure
    .input(scopeInput.extend({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const { organizationId, role } = await resolveOrgScope(context, input);
      requireWriteRole(role);

      const { count } = await prisma.alertRule.deleteMany({
        where: { id: input.id, organizationId },
      });
      if (count === 0) {
        throw new ORPCError("NOT_FOUND", { message: "Alert rule not found" });
      }
      return { id: input.id };
    }),

  // On-demand evaluation of every enabled rule in the scope. There is no
  // scheduler in the repo yet; this is the single entry point a cron would call.
  evaluate: protectedProcedure
    .input(scopeInput)
    .handler(async ({ context, input }) => {
      const { organizationId } = await resolveOrgScope(context, input);

      let projectIds: string[];
      let scopeLabel: string;

      if (input.projectId) {
        const project = await prisma.project.findFirstOrThrow({
          select: { name: true },
          where: { id: input.projectId, organizationId },
        });
        projectIds = [input.projectId];
        scopeLabel = `project ${project.name}`;
      } else {
        const [org, projects] = await Promise.all([
          prisma.organization.findFirstOrThrow({
            select: { name: true },
            where: { id: organizationId },
          }),
          prisma.project.findMany({
            select: { id: true },
            where: { organizationId },
          }),
        ]);
        projectIds = projects.map((project) => project.id);
        scopeLabel = `organization ${org.name}`;
      }

      const rules = await prisma.alertRule.findMany({
        select: alertSelect,
        where: { ...scopeWhere(input, organizationId), enabled: true },
      });

      if (rules.length === 0 || projectIds.length === 0) {
        return { checked: rules.length, fired: 0, results: [] };
      }

      const now = new Date();
      const resolved: ResolvedAlertRule[] = rules.map((rule) => ({
        channel: rule.channel,
        destination: rule.destination,
        id: rule.id,
        lastFiredAt: rule.lastFiredAt,
        metricConfig: metricConfigSchema.parse(rule.metric.config),
        metricName: rule.metric.name,
        name: rule.name,
        operator: rule.operator,
        projectIds,
        scopeLabel,
        threshold: rule.threshold,
        window: rule.window,
      }));

      const results = await runAlerts(
        { ch: context.ch, notifier: createAlertNotifier(), now },
        resolved
      );

      const notifiedIds = results
        .filter((result) => result.notified)
        .map((result) => result.ruleId);
      if (notifiedIds.length > 0) {
        await prisma.alertRule.updateMany({
          data: { lastFiredAt: now },
          where: { id: { in: notifiedIds } },
        });
      }

      return {
        checked: results.length,
        fired: notifiedIds.length,
        results,
      };
    }),

  list: protectedProcedure
    .input(scopeInput)
    .handler(async ({ context, input }) => {
      const { organizationId } = await resolveOrgScope(context, input);

      const rules = await prisma.alertRule.findMany({
        orderBy: { createdAt: "asc" },
        select: alertSelect,
        where: scopeWhere(input, organizationId),
      });
      return rules.map(toSnapshot);
    }),

  update: protectedProcedure
    .input(
      scopeInput
        .extend({ id: z.string().min(1) })
        .extend(alertRuleInputSchema.partial().shape)
    )
    .handler(async ({ context, input }) => {
      const { organizationId, role } = await resolveOrgScope(context, input);
      requireWriteRole(role);

      const existing = await prisma.alertRule.findFirst({
        select: { channel: true, destination: true },
        where: { id: input.id, organizationId },
      });
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "Alert rule not found" });
      }

      if (input.channel !== undefined || input.destination !== undefined) {
        assertDestination(
          input.channel ?? existing.channel,
          input.destination ?? existing.destination
        );
      }

      if (input.metricId !== undefined) {
        await assertMetricInOrg(input.metricId, organizationId);
      }

      const rule = await prisma.alertRule.update({
        data: {
          ...(input.channel === undefined ? {} : { channel: input.channel }),
          ...(input.destination === undefined
            ? {}
            : { destination: input.destination }),
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.metricId === undefined ? {} : { metricId: input.metricId }),
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.operator === undefined ? {} : { operator: input.operator }),
          ...(input.threshold === undefined
            ? {}
            : { threshold: input.threshold }),
          ...(input.window === undefined ? {} : { window: input.window }),
        },
        select: alertSelect,
        where: { id: input.id },
      });
      return toSnapshot(rule);
    }),
};
