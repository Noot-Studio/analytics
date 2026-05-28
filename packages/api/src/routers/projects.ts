import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import { protectedProcedure } from "../index";

function requireActiveOrg(context: {
  session: { session: { activeOrganizationId?: string | null } };
}): string {
  const orgId = context.session.session.activeOrganizationId;
  if (!orgId) {
    throw new ORPCError("FORBIDDEN", { message: "No active organization" });
  }
  return orgId;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 64);
}

async function assertOrgMembership(
  userId: string,
  organizationId: string
): Promise<void> {
  const member = await prisma.member.findFirst({
    select: { id: true },
    where: { organizationId, userId },
  });
  if (!member) {
    throw new ORPCError("FORBIDDEN", {
      message: "Organization not accessible",
    });
  }
}

async function assertProjectAccess(
  userId: string,
  projectId: string
): Promise<string> {
  const project = await prisma.project.findFirst({
    select: { organizationId: true },
    where: { id: projectId },
  });

  if (!project) {
    throw new ORPCError("NOT_FOUND", { message: "Project not found" });
  }

  await assertOrgMembership(userId, project.organizationId);
  return project.organizationId;
}

export const projectsRouter = {
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(64).optional(),
      })
    )
    .handler(async ({ context, input }) => {
      const organizationId = requireActiveOrg(context);
      await assertOrgMembership(context.session.user.id, organizationId);

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
          name: input.name,
          organizationId,
          slug,
        },
        select: {
          createdAt: true,
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
      await assertProjectAccess(context.session.user.id, input.id);

      await prisma.project.delete({
        where: { id: input.id },
      });

      return { id: input.id };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      await assertProjectAccess(context.session.user.id, input.id);

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

  list: protectedProcedure.handler(async ({ context }) => {
    const organizationId = requireActiveOrg(context);
    await assertOrgMembership(context.session.user.id, organizationId);

    return prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        _count: {
          select: { apiKeys: true },
        },
        createdAt: true,
        id: true,
        name: true,
        slug: true,
      },
      where: { organizationId },
    });
  }),
};
