import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import {
  assertOrgAccess,
  assertProjectAccess,
  requireActiveOrg,
} from "../access";
import type { DashboardCardSnapshot } from "../dashboard-cards";
import {
  cardSchema,
  cardSizeSchema,
  CUSTOM_CARD_TYPE,
  customCardConfigSchema,
  DEFAULT_ORG_OVERVIEW,
  DEFAULT_PROJECT_OVERVIEW,
} from "../dashboard-cards";
import { protectedProcedure } from "../index";

const MAX_CARDS = 30;

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
  cards: z.array(cardSchema).max(MAX_CARDS),
  organizationId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  scope: scopeSchema,
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

const defaultCards = (scope: Scope): DashboardCardSnapshot[] =>
  scope === "ProjectOverview" ? DEFAULT_PROJECT_OVERVIEW : DEFAULT_ORG_OVERVIEW;

/** Cards may pin a project; every pinned project must live in the same org. */
const assertPinnedProjects = async (
  cards: z.infer<typeof saveInput>["cards"],
  organizationId: string
): Promise<void> => {
  const pinnedIds = [
    ...new Set(
      cards.flatMap((card) =>
        card.config.projectId ? [card.config.projectId] : []
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
      message: "Card references a project outside the organization",
    });
  }
};

const cardRowSelect = {
  cardType: true,
  config: true,
  id: true,
  position: true,
  size: true,
} as const;

// Library procedures resolve their org like get/save: explicit org id, or via
// the project, or the session's active organization.
const libraryScopeInput = z.object({
  organizationId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
});

const resolveOrg = async (
  context: SessionContext,
  input: z.infer<typeof libraryScopeInput>
): Promise<string> => {
  if (input.projectId) {
    return await assertProjectAccess(input.projectId, context.session.user.id);
  }
  const organizationId = input.organizationId ?? requireActiveOrg(context);
  await assertOrgAccess(organizationId, context.session.user.id);
  return organizationId;
};

export const dashboardsRouter = {
  get: protectedProcedure
    .input(getInput)
    .handler(async ({ context, input }) => {
      const { organizationId, projectId } = await resolveScope(context, input);

      const dashboard = await prisma.dashboard.findFirst({
        select: {
          cards: { orderBy: { position: "asc" }, select: cardRowSelect },
          id: true,
        },
        where: { organizationId, projectId, scope: input.scope },
      });

      if (!dashboard) {
        return {
          cards: defaultCards(input.scope),
          id: null,
          scope: input.scope,
        };
      }

      return {
        cards: dashboard.cards.map((card) => ({
          cardType: card.cardType,
          config: card.config as unknown,
          id: card.id,
          position: card.position,
          size: cardSizeSchema.parse(card.size),
        })),
        id: dashboard.id,
        scope: input.scope,
      };
    }),

  // Reusable user-created card definitions; built-in cards live in code.
  libraryCreate: protectedProcedure
    .input(libraryScopeInput.extend({ config: customCardConfigSchema }))
    .handler(async ({ context, input }) => {
      const organizationId = await resolveOrg(context, input);

      const definition = await prisma.dashboardCardDefinition.create({
        data: {
          cardType: CUSTOM_CARD_TYPE,
          config: input.config,
          organizationId,
        },
        select: { cardType: true, config: true, id: true },
      });
      return {
        cardType: definition.cardType,
        config: definition.config as unknown,
        id: definition.id,
      };
    }),

  libraryDelete: protectedProcedure
    .input(libraryScopeInput.extend({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = await resolveOrg(context, input);

      const { count } = await prisma.dashboardCardDefinition.deleteMany({
        where: { id: input.id, organizationId },
      });
      if (count === 0) {
        throw new ORPCError("NOT_FOUND", {
          message: "Card definition not found",
        });
      }
      return { id: input.id };
    }),

  libraryList: protectedProcedure
    .input(libraryScopeInput)
    .handler(async ({ context, input }) => {
      const organizationId = await resolveOrg(context, input);

      const definitions = await prisma.dashboardCardDefinition.findMany({
        orderBy: { createdAt: "asc" },
        select: { cardType: true, config: true, id: true },
        where: { organizationId },
      });
      return definitions.map((definition) => ({
        cardType: definition.cardType,
        config: definition.config as unknown,
        id: definition.id,
      }));
    }),

  save: protectedProcedure
    .input(saveInput)
    .handler(async ({ context, input }) => {
      const { organizationId, projectId } = await resolveScope(context, input);
      await assertPinnedProjects(input.cards, organizationId);

      const where = { organizationId, projectId, scope: input.scope };
      const existing = await prisma.dashboard.findFirst({
        select: { id: true },
        where,
      });
      const dashboard =
        existing ?? (await prisma.dashboard.create({ data: where }));

      // Whole-set replace keeps reorder/add/remove atomic; last write wins.
      const [_deleted, _created, saved] = await prisma.$transaction([
        prisma.dashboardCard.deleteMany({
          where: { dashboardId: dashboard.id },
        }),
        prisma.dashboardCard.createMany({
          data: input.cards.map((card, index) => ({
            cardType: card.cardType,
            config: card.config,
            dashboardId: dashboard.id,
            id: card.id ?? crypto.randomUUID(),
            position: index,
            size: card.size,
          })),
        }),
        prisma.dashboardCard.findMany({
          orderBy: { position: "asc" },
          select: cardRowSelect,
          where: { dashboardId: dashboard.id },
        }),
      ]);

      return {
        cards: saved.map((card) => ({
          cardType: card.cardType,
          config: card.config as unknown,
          id: card.id,
          position: card.position,
          size: cardSizeSchema.parse(card.size),
        })),
        id: dashboard.id,
        scope: input.scope,
      };
    }),
};
