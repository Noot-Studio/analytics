import { createHash, randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { buildPrismaWhere } from "../prisma-filters";
import { filterSchema } from "../query-builder";

// Columns the data-table may filter on; anything else is dropped server-side.
const API_KEY_FILTER_COLUMNS = new Set(["name"]);

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function generateKeyPair() {
  const publishableKey = `pk_${randomUUID().replaceAll("-", "")}`;
  const secretKey = `sk_${randomUUID().replaceAll("-", "")}`;
  return { publishableKey, secretHash: hashSecret(secretKey), secretKey };
}

async function assertProjectAccess(
  userId: string,
  projectId: string
): Promise<void> {
  const project = await prisma.project.findFirst({
    select: { organizationId: true },
    where: { id: projectId },
  });

  if (!project) {
    throw new ORPCError("NOT_FOUND", { message: "Project not found" });
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
}

export const apiKeysRouter = {
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        projectId: z.string().min(1),
      })
    )
    .handler(async ({ context, input }) => {
      await assertProjectAccess(context.session.user.id, input.projectId);

      const { publishableKey, secretKey, secretHash } = generateKeyPair();
      const apiKey = await prisma.apiKey.create({
        data: {
          name: input.name,
          projectId: input.projectId,
          publishableKey,
          secretHash,
        },
        select: { id: true, name: true, publishableKey: true },
      });
      return { ...apiKey, secretKey };
    }),

  list: protectedProcedure
    .input(
      z.object({
        filters: z.array(filterSchema).max(10).optional(),
        joinOperator: z.enum(["and", "or"]).default("and"),
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(100).default(10),
        projectId: z.string().min(1),
        sortBy: z.enum(["name", "createdAt", "lastUsedAt"]).optional(),
        sortDesc: z.boolean().default(true),
      })
    )
    .handler(async ({ context, input }) => {
      await assertProjectAccess(context.session.user.id, input.projectId);

      const sortBy = input.sortBy ?? "createdAt";
      const where = {
        projectId: input.projectId,
        revokedAt: null,
        ...buildPrismaWhere(
          input.filters,
          API_KEY_FILTER_COLUMNS,
          input.joinOperator
        ),
      };

      const [rows, total] = await Promise.all([
        prisma.apiKey.findMany({
          orderBy: { [sortBy]: input.sortDesc ? "desc" : "asc" },
          select: {
            createdAt: true,
            id: true,
            lastUsedAt: true,
            name: true,
            publishableKey: true,
          },
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          where,
        }),
        prisma.apiKey.count({ where }),
      ]);

      return { rows, total };
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const apiKey = await prisma.apiKey.findFirst({
        select: { projectId: true },
        where: { id: input.id, revokedAt: null },
      });

      if (!apiKey) {
        throw new ORPCError("NOT_FOUND", { message: "API key not found" });
      }

      await assertProjectAccess(context.session.user.id, apiKey.projectId);

      await prisma.apiKey.update({
        data: { revokedAt: new Date() },
        where: { id: input.id },
      });

      return { id: input.id };
    }),

  rotate: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const apiKey = await prisma.apiKey.findFirst({
        select: { projectId: true },
        where: { id: input.id, revokedAt: null },
      });

      if (!apiKey) {
        throw new ORPCError("NOT_FOUND", { message: "API key not found" });
      }

      await assertProjectAccess(context.session.user.id, apiKey.projectId);

      const { publishableKey, secretKey, secretHash } = generateKeyPair();
      await prisma.apiKey.update({
        data: { publishableKey, secretHash },
        where: { id: input.id },
      });

      return { publishableKey, secretKey };
    }),
};
