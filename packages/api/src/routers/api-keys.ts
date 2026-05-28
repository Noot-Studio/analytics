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
  const publishableKey = `pk_${randomUUID().replaceAll("-", "")}`;
  const secretKey = `sk_${randomUUID().replaceAll("-", "")}`;
  return { publishableKey, secretHash: hashSecret(secretKey), secretKey };
}

export const apiKeysRouter = {
  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .handler(async ({ context, input }) => {
      const organizationId = requireActiveOrg(
        context.session.session.activeOrganizationId
      );
      const { publishableKey, secretKey, secretHash } = generateKeyPair();
      const apiKey = await prisma.apiKey.create({
        data: { name: input.name, organizationId, publishableKey, secretHash },
        select: { id: true, name: true, publishableKey: true },
      });
      return { ...apiKey, secretKey };
    }),

  list: protectedProcedure.handler(async ({ context }) => {
    const organizationId = requireActiveOrg(
      context.session.session.activeOrganizationId
    );
    return prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        id: true,
        lastUsedAt: true,
        name: true,
        publishableKey: true,
      },
      where: { organizationId, revokedAt: null },
    });
  }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = requireActiveOrg(
        context.session.session.activeOrganizationId
      );
      try {
        await prisma.apiKey.update({
          data: { revokedAt: new Date() },
          where: { id: input.id, organizationId, revokedAt: null },
        });
      } catch {
        throw new ORPCError("FORBIDDEN", { message: "API key not found" });
      }
      return { id: input.id };
    }),

  rotate: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const organizationId = requireActiveOrg(
        context.session.session.activeOrganizationId
      );
      const { publishableKey, secretKey, secretHash } = generateKeyPair();
      try {
        await prisma.apiKey.update({
          data: { publishableKey, secretHash },
          where: { id: input.id, organizationId, revokedAt: null },
        });
      } catch {
        throw new ORPCError("FORBIDDEN", { message: "API key not found" });
      }
      return { publishableKey, secretKey };
    }),
};
