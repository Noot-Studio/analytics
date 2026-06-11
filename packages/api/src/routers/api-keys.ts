import { createHash, randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import prisma from "@sbox-analytics/db";
import { env } from "@sbox-analytics/env/server";
import { apiKeyCacheKey, apiSecretCacheKey } from "@sbox-analytics/events";
import { RedisClient } from "bun";
import { z } from "zod";

import { assertProjectAccess, requireWriteRole } from "../access";
import {
  projectProcedure,
  projectWriteProcedure,
  protectedProcedure,
} from "../index";
import { buildPrismaWhere } from "../prisma-filters";
import { filterSchema } from "../query-builder";

// Drop the ingest resolver's cache for a key so a revoke/rotate takes effect
// immediately rather than waiting out the positive TTL. Shares apiKeyCacheKey
// with apps/ingest so both planes agree on the key format. Best-effort: a Redis
// outage must not fail the mutation (Postgres is already updated) — the positive
// TTL bounds how long a revoked key stays cached-valid.
const redis = new RedisClient(env.REDIS_URL);
const revokeApiKeyCache = async (
  publishableKey: string,
  secretHash: string
): Promise<void> => {
  try {
    await redis.del(apiKeyCacheKey(publishableKey));
    await redis.del(apiSecretCacheKey(secretHash));
  } catch {
    // Cache eviction is best-effort; the key's positive TTL is the backstop.
  }
};

// Columns the data-table may filter on; anything else is dropped server-side.
const API_KEY_FILTER_COLUMNS = new Set(["name"]);

// Active (non-revoked) keys per project; matches the dashboard's unpaginated list cap.
const MAX_ACTIVE_KEYS_PER_PROJECT = 100;

const hashSecret = (secret: string): string =>
  createHash("sha256").update(secret).digest("hex");

const generateKeyPair = () => {
  const publishableKey = `pk_${randomUUID().replaceAll("-", "")}`;
  const secretKey = `sk_${randomUUID().replaceAll("-", "")}`;
  return { publishableKey, secretHash: hashSecret(secretKey), secretKey };
};

export const apiKeysRouter = {
  create: projectWriteProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        projectId: z.string().min(1),
      })
    )
    .handler(async ({ input }) => {
      const activeKeyCount = await prisma.apiKey.count({
        where: { projectId: input.projectId, revokedAt: null },
      });
      if (activeKeyCount >= MAX_ACTIVE_KEYS_PER_PROJECT) {
        throw new ORPCError("FORBIDDEN", {
          message: `Projects are limited to ${MAX_ACTIVE_KEYS_PER_PROJECT} active API keys`,
        });
      }

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

  list: projectProcedure
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
    .handler(async ({ input }) => {
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
        select: { projectId: true, publishableKey: true, secretHash: true },
        where: { id: input.id, revokedAt: null },
      });

      if (!apiKey) {
        throw new ORPCError("NOT_FOUND", { message: "API key not found" });
      }

      const { role } = await assertProjectAccess(
        apiKey.projectId,
        context.session.user.id
      );
      requireWriteRole(role);

      await prisma.apiKey.update({
        data: { revokedAt: new Date() },
        where: { id: input.id },
      });
      await revokeApiKeyCache(apiKey.publishableKey, apiKey.secretHash);

      return { id: input.id };
    }),

  rotate: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const apiKey = await prisma.apiKey.findFirst({
        select: { projectId: true, publishableKey: true, secretHash: true },
        where: { id: input.id, revokedAt: null },
      });

      if (!apiKey) {
        throw new ORPCError("NOT_FOUND", { message: "API key not found" });
      }

      const { role } = await assertProjectAccess(
        apiKey.projectId,
        context.session.user.id
      );
      requireWriteRole(role);

      const { publishableKey, secretKey, secretHash } = generateKeyPair();
      await prisma.apiKey.update({
        data: { publishableKey, secretHash },
        where: { id: input.id },
      });
      await revokeApiKeyCache(apiKey.publishableKey, apiKey.secretHash);

      return { publishableKey, secretKey };
    }),
};
