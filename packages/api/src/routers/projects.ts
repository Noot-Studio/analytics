import { ORPCError } from "@orpc/server";
import prisma, { ProjectEnvironment } from "@sbox-analytics/db";
import { z } from "zod";

import {
  assertOrgAccess,
  assertProjectAccess,
  requireActiveOrg,
} from "../access";
import { protectedProcedure } from "../index";
import { buildPrismaWhere } from "../prisma-filters";
import { filterSchema } from "../query-builder";

const projectsListInput = z.object({
  filters: z.array(filterSchema).max(10).optional(),
  joinOperator: z.enum(["and", "or"]).default("and"),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["name", "slug", "environment", "createdAt"]).optional(),
  sortDesc: z.boolean().default(true),
});

// Columns the data-table may filter on; anything else is dropped server-side.
const PROJECT_FILTER_COLUMNS = new Set(["name", "slug", "environment"]);

// Projects per organization; matches the dashboard's unpaginated list cap.
const MAX_PROJECTS_PER_ORG = 100;

const generateSlug = (name: string): string =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "")
    .slice(0, 64);

export const projectsRouter = {
  create: protectedProcedure
    .input(
      z.object({
        environment: z
          .enum(ProjectEnvironment)
          .default(ProjectEnvironment.Development),
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(64).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const organizationId = requireActiveOrg(context);
      await assertOrgAccess(organizationId, context.session.user.id);

      const projectCount = await prisma.project.count({
        where: { organizationId },
      });
      if (projectCount >= MAX_PROJECTS_PER_ORG) {
        throw new ORPCError("FORBIDDEN", {
          message: `Organizations are limited to ${MAX_PROJECTS_PER_ORG} projects`,
        });
      }

      const slug = input.slug || generateSlug(input.name);

      const existing = await prisma.project.findFirst({
        select: { id: true },
        where: { organizationId, slug },
      });

      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: "Project slug already exists",
        });
      }

      const project = await prisma.project.create({
        data: {
          environment: input.environment,
          name: input.name,
          organizationId,
          slug,
        },
        select: {
          createdAt: true,
          environment: true,
          id: true,
          name: true,
          organizationId: true,
          slug: true,
        },
      });

      return project;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.id, context.session.user.id);

      await prisma.project.delete({
        where: { id: input.id },
      });

      return { id: input.id };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await assertProjectAccess(input.id, context.session.user.id);

      const project = await prisma.project.findFirst({
        select: {
          apiKeys: {
            select: {
              createdAt: true,
              id: true,
              lastUsedAt: true,
              name: true,
              publishableKey: true,
            },
            where: { revokedAt: null },
          },
          createdAt: true,
          environment: true,
          id: true,
          name: true,
          organizationId: true,
          slug: true,
        },
        where: { id: input.id },
      });

      if (!project) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }

      return project;
    }),

  list: protectedProcedure
    .input(projectsListInput.optional())
    .handler(async ({ context, input }) => {
      const organizationId = requireActiveOrg(context);
      await assertOrgAccess(organizationId, context.session.user.id);

      const page = input?.page ?? 1;
      const perPage = input?.perPage ?? 10;
      const sortBy = input?.sortBy ?? "createdAt";
      const sortDesc = input?.sortDesc ?? true;
      const where = {
        organizationId,
        ...buildPrismaWhere(
          input?.filters,
          PROJECT_FILTER_COLUMNS,
          input?.joinOperator ?? "and"
        ),
      };

      const [rows, total] = await Promise.all([
        prisma.project.findMany({
          orderBy: { [sortBy]: sortDesc ? "desc" : "asc" },
          select: {
            apiKeys: {
              select: { lastUsedAt: true },
              where: { revokedAt: null },
            },
            createdAt: true,
            environment: true,
            id: true,
            name: true,
            slug: true,
          },
          skip: (page - 1) * perPage,
          take: perPage,
          where,
        }),
        prisma.project.count({ where }),
      ]);

      return { rows, total };
    }),
};
