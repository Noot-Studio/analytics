import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import {
  assertOrgAccess,
  assertProjectAccess,
  requireActiveOrg,
} from "../access";
import type { DashboardWidgetSnapshot } from "../dashboard-widgets";
import {
  widgetSchema,
  widgetSizeSchema,
  DEFAULT_ORG_OVERVIEW,
  DEFAULT_PROJECT_OVERVIEW,
  METRIC_WIDGET_TYPE,
} from "../dashboard-widgets";
import { protectedProcedure } from "../index";
import { compatibleVisualizations, resultShape } from "../metrics";

const MAX_WIDGETS = 30;

// CustomPage is reserved for a later feature; only overviews are editable now.
const scopeSchema = z.enum(["OrgOverview", "ProjectOverview"]);

const getInput = z.object({
  // Explicit org id keeps query caches per-org; falls back to the session's
  // active organization when omitted.
  organizationId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  scope: scopeSchema,
});

const saveInput = z.object({
  organizationId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  scope: scopeSchema,
  widgets: z.array(widgetSchema).max(MAX_WIDGETS),
});

type Scope = z.infer<typeof scopeSchema>;

interface ResolvedScope {
  organizationId: string;
  projectId: string | null;
}

interface SessionContext {
  session: {
    session: { activeOrganizationId?: string | null };
    user: { id: string };
  };
}

const resolveScope = async (
  context: SessionContext,
  input: { organizationId?: string; projectId?: string; scope: Scope }
): Promise<ResolvedScope> => {
  if (input.scope === "ProjectOverview") {
    if (!input.projectId) {
      throw new ORPCError("BAD_REQUEST", {
        message: "projectId is required for project dashboards",
      });
    }
    const organizationId = await assertProjectAccess(
      input.projectId,
      context.session.user.id
    );
    return { organizationId, projectId: input.projectId };
  }

  const organizationId = input.organizationId ?? requireActiveOrg(context);
  await assertOrgAccess(organizationId, context.session.user.id);
  return { organizationId, projectId: null };
};

const defaultWidgets = (scope: Scope): DashboardWidgetSnapshot[] =>
  scope === "ProjectOverview" ? DEFAULT_PROJECT_OVERVIEW : DEFAULT_ORG_OVERVIEW;

/** Widgets may pin a project; every pinned project must live in the same org. */
const assertPinnedProjects = async (
  widgets: z.infer<typeof saveInput>["widgets"],
  organizationId: string
): Promise<void> => {
  const pinnedIds = [
    ...new Set(
      widgets.flatMap((widget) =>
        widget.config.projectId ? [widget.config.projectId] : []
      )
    ),
  ];
  if (pinnedIds.length === 0) {
    return;
  }

  const count = await prisma.project.count({
    where: { id: { in: pinnedIds }, organizationId },
  });
  if (count !== pinnedIds.length) {
    throw new ORPCError("FORBIDDEN", {
      message: "Widget references a project outside the organization",
    });
  }
};

/**
 * Metric widgets reference saved metrics: each must live in the same org, and
 * the widget's visualization must be compatible with the metric's result
 * shape (a scalar can't render as an area chart, etc.).
 */
const assertReferencedMetrics = async (
  widgets: z.infer<typeof saveInput>["widgets"],
  organizationId: string
): Promise<void> => {
  const metricWidgets = widgets.filter(
    (widget) => widget.widgetType === METRIC_WIDGET_TYPE
  );
  if (metricWidgets.length === 0) {
    return;
  }
  const metricIds = [
    ...new Set(metricWidgets.map((widget) => widget.config.metricId)),
  ];

  const metrics = await prisma.metric.findMany({
    select: { id: true },
    where: { id: { in: metricIds }, organizationId },
  });
  if (metrics.length !== metricIds.length) {
    throw new ORPCError("FORBIDDEN", {
      message: "Widget references a metric outside the organization",
    });
  }

  // The widget owns granularity/groupBy, so the result shape — and thus which
  // visualizations are valid — is determined by the widget config alone.
  for (const widget of metricWidgets) {
    const shape = resultShape(widget.config);
    if (
      !compatibleVisualizations(shape).includes(widget.config.visualization)
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Visualization "${widget.config.visualization}" cannot render a ${shape} metric`,
      });
    }
  }
};

const widgetRowSelect = {
  config: true,
  id: true,
  position: true,
  size: true,
  widgetType: true,
} as const;

export const dashboardsRouter = {
  get: protectedProcedure
    .input(getInput)
    .handler(async ({ context, input }) => {
      const { organizationId, projectId } = await resolveScope(context, input);

      const dashboard = await prisma.dashboard.findFirst({
        select: {
          id: true,
          widgets: { orderBy: { position: "asc" }, select: widgetRowSelect },
        },
        where: { organizationId, projectId, scope: input.scope },
      });

      if (!dashboard) {
        return {
          id: null,
          scope: input.scope,
          widgets: defaultWidgets(input.scope),
        };
      }

      return {
        id: dashboard.id,
        scope: input.scope,
        widgets: dashboard.widgets.map((widget) => ({
          config: widget.config as unknown,
          id: widget.id,
          position: widget.position,
          size: widgetSizeSchema.parse(widget.size),
          widgetType: widget.widgetType,
        })),
      };
    }),

  save: protectedProcedure
    .input(saveInput)
    .handler(async ({ context, input }) => {
      const { organizationId, projectId } = await resolveScope(context, input);
      await assertPinnedProjects(input.widgets, organizationId);
      await assertReferencedMetrics(input.widgets, organizationId);

      const where = { organizationId, projectId, scope: input.scope };
      const existing = await prisma.dashboard.findFirst({
        select: { id: true },
        where,
      });
      const dashboard =
        existing ?? (await prisma.dashboard.create({ data: where }));

      // Whole-set replace keeps reorder/add/remove atomic; last write wins.
      const [_deleted, _created, saved] = await prisma.$transaction([
        prisma.dashboardWidget.deleteMany({
          where: { dashboardId: dashboard.id },
        }),
        prisma.dashboardWidget.createMany({
          data: input.widgets.map((widget, index) => ({
            config: widget.config,
            dashboardId: dashboard.id,
            id: widget.id ?? crypto.randomUUID(),
            position: index,
            size: widget.size,
            widgetType: widget.widgetType,
          })),
        }),
        prisma.dashboardWidget.findMany({
          orderBy: { position: "asc" },
          select: widgetRowSelect,
          where: { dashboardId: dashboard.id },
        }),
      ]);

      return {
        id: dashboard.id,
        scope: input.scope,
        widgets: saved.map((widget) => ({
          config: widget.config as unknown,
          id: widget.id,
          position: widget.position,
          size: widgetSizeSchema.parse(widget.size),
          widgetType: widget.widgetType,
        })),
      };
    }),
};
