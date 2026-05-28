import { createHash, randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { z } from "zod";

import { protectedProcedure } from "../index";

function requireActiveOrg(organizationId: string | null | undefined): string {
  if (!organizationId) {
    throw new ORPCError("FORBIDDEN", { message: "No active organization" });
  }
  return organizationId;
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function generateKeyPair() {
  const publishableKey = `pk_${randomUUID().replace(/-/g, "")}`;
  const secretKey = `sk_${randomUUID().replace(/-/g, "")}`;
  return { publishableKey, secretKey, secretHash: hashSecret(secretKey) };
}

export const apiKeysRouter = {
  list: protectedProcedure.handler(async ({ context }) => {
    const organizationId = requireActiveOrg(
      context.session.session.activeOrganizationId,
    );
    return prisma.apiKey.findMany({
      where: { organizationId, revokedAt: null },
      select: {
        id: true,
        name: true,
        publishableKey: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .handler(async ({ context, input }) => {
      const organizationId = requireActiveOrg(
        context.session.session.activeOrganizationId,
      );
      const { publishableKey, secretKey, secretHash } = generateKeyPair();
      const apiKey = await prisma.apiKey.create({
        data: { organizationId, name: input.name, publishableKey, secretHash },
        select: { id: true, name: true, publishableKey: true },
      });
      return { ...apiKey, secretKey };
    }),

  rotate: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = requireActiveOrg(
        context.session.session.activeOrganizationId,
      );
      const existing = await prisma.apiKey.findFirst({
        where: { id: input.id, organizationId },
        select: { id: true },
      });
      if (!existing) {
        throw new ORPCError("FORBIDDEN", { message: "API key not found" });
      }
      const { publishableKey, secretKey, secretHash } = generateKeyPair();
      await prisma.apiKey.update({
        where: { id: input.id },
        data: { publishableKey, secretHash },
      });
      return { publishableKey, secretKey };
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = requireActiveOrg(
        context.session.session.activeOrganizationId,
      );
      const existing = await prisma.apiKey.findFirst({
        where: { id: input.id, organizationId },
        select: { id: true },
      });
      if (!existing) {
        throw new ORPCError("FORBIDDEN", { message: "API key not found" });
      }
      await prisma.apiKey.update({
        where: { id: input.id },
        data: { revokedAt: new Date() },
      });
      return { id: input.id };
    }),
};
