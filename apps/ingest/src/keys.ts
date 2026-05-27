import prisma from "@sbox-analytics/db";
import { RedisClient } from "bun";

const POSITIVE_TTL_SECONDS = 5 * 60;
const NEGATIVE_TTL_SECONDS = 30;
const INVALID_MARKER = "-";

export class InvalidApiKeyError extends Error {
  constructor() {
    super("invalid api key");
    this.name = "InvalidApiKeyError";
  }
}

export interface KeyResolver {
  resolve(publishableKey: string): Promise<string>;
}

export function createKeyResolver(redisUrl: string): KeyResolver {
  const redis = new RedisClient(redisUrl);

  return {
    async resolve(publishableKey: string): Promise<string> {
      if (!publishableKey) {
        throw new InvalidApiKeyError();
      }
      const cacheKey = `ingest:apikey:${publishableKey}`;

      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        if (cached === INVALID_MARKER) {
          throw new InvalidApiKeyError();
        }
        return cached;
      }

      const row = await prisma.apiKey.findFirst({
        select: { projectId: true },
        where: { publishableKey, revokedAt: null },
      });

      if (!row) {
        await redis.send("SET", [
          cacheKey,
          INVALID_MARKER,
          "EX",
          String(NEGATIVE_TTL_SECONDS),
        ]);
        throw new InvalidApiKeyError();
      }

      await redis.send("SET", [
        cacheKey,
        row.projectId,
        "EX",
        String(POSITIVE_TTL_SECONDS),
      ]);
      return row.projectId;
    },
  };
}
