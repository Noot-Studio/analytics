import { createHash } from "node:crypto";

import prisma from "@sbox-analytics/db";
import { apiKeyCacheKey, apiSecretCacheKey } from "@sbox-analytics/events";
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

// The prisma lookup behind a port: maps a publishable key to its project, or
// null when no active (non-revoked) key matches.
export interface KeyDirectory {
  findProjectId(publishableKey: string): Promise<string | null>;
}

// The redis cache behind a port. Values are a projectId or the negative-cache
// sentinel; del() is used by the control plane to invalidate on revoke/rotate.
export interface KeyCache {
  get(publishableKey: string): Promise<string | null>;
  set(publishableKey: string, value: string, ttlSeconds: number): Promise<void>;
  del(publishableKey: string): Promise<void>;
}

export interface KeyResolver {
  resolve(publishableKey: string): Promise<string>;
}

// Holds the cache policy (sentinel + TTLs) over injected ports, so it is fully
// testable with in-memory fakes.
export const createKeyResolver = ({
  directory,
  cache,
}: {
  directory: KeyDirectory;
  cache: KeyCache;
}): KeyResolver => ({
  async resolve(publishableKey: string): Promise<string> {
    if (!publishableKey) {
      throw new InvalidApiKeyError();
    }

    const cached = await cache.get(publishableKey);
    if (cached !== null) {
      if (cached === INVALID_MARKER) {
        throw new InvalidApiKeyError();
      }
      return cached;
    }

    const projectId = await directory.findProjectId(publishableKey);

    if (projectId === null) {
      await cache.set(publishableKey, INVALID_MARKER, NEGATIVE_TTL_SECONDS);
      throw new InvalidApiKeyError();
    }

    await cache.set(publishableKey, projectId, POSITIVE_TTL_SECONDS);
    return projectId;
  },
});

// Secret-key (sk_) resolver for the editor read endpoints. Only the sha256
// hash is stored (Postgres) or used as a lookup/cache key (Redis) — the raw
// secret never persists anywhere. Same cache policy as the publishable path.
export const hashSecret = (secret: string): string =>
  createHash("sha256").update(secret).digest("hex");

export const createSecretKeyResolver = ({
  directory,
  cache,
}: {
  directory: KeyDirectory;
  cache: KeyCache;
}): KeyResolver => {
  const inner = createKeyResolver({ cache, directory });
  return {
    resolve(secretKey: string): Promise<string> {
      if (!secretKey) {
        throw new InvalidApiKeyError();
      }
      return inner.resolve(hashSecret(secretKey));
    },
  };
};

const prismaDirectory: KeyDirectory = {
  async findProjectId(publishableKey: string): Promise<string | null> {
    const row = await prisma.apiKey.findFirst({
      select: { projectId: true },
      where: { publishableKey, revokedAt: null },
    });
    return row?.projectId ?? null;
  },
};

// Lookup for the secret-key path: the resolver hands us the sha256 hash.
const prismaSecretDirectory: KeyDirectory = {
  async findProjectId(secretHash: string): Promise<string | null> {
    const row = await prisma.apiKey.findFirst({
      select: { projectId: true },
      where: { revokedAt: null, secretHash },
    });
    return row?.projectId ?? null;
  },
};

const createRedisCache = (
  redisUrl: string,
  cacheKey: (key: string) => string
): KeyCache => {
  const redis = new RedisClient(redisUrl);
  return {
    async del(key) {
      await redis.del(cacheKey(key));
    },
    get: (key) => redis.get(cacheKey(key)),
    async set(key, value, ttlSeconds) {
      await redis.send("SET", [cacheKey(key), value, "EX", String(ttlSeconds)]);
    },
  };
};

// Production wiring: prisma-backed directory + redis-backed cache. Keeps the
// index.ts call site a one-liner.
export const createRedisKeyResolver = (redisUrl: string): KeyResolver =>
  createKeyResolver({
    cache: createRedisCache(redisUrl, apiKeyCacheKey),
    directory: prismaDirectory,
  });

export const createRedisSecretKeyResolver = (redisUrl: string): KeyResolver =>
  createSecretKeyResolver({
    cache: createRedisCache(redisUrl, apiSecretCacheKey),
    directory: prismaSecretDirectory,
  });
