import { beforeEach, describe, expect, it } from "bun:test";

import {
  createKeyResolver,
  createSecretKeyResolver,
  hashSecret,
  InvalidApiKeyError,
} from "./keys";
import type { KeyCache, KeyDirectory, KeyResolver } from "./keys";

const INVALID_MARKER = "-";

// In-memory cache fake, plus call counters so tests can assert population.
const createFakeCache = () => {
  const store = new Map<string, string>();
  let setCalls = 0;
  return {
    cache: {
      del: (pk: string) => {
        store.delete(pk);
        return Promise.resolve();
      },
      get: (pk: string) => Promise.resolve(store.get(pk) ?? null),
      set: (pk: string, value: string) => {
        setCalls += 1;
        store.set(pk, value);
        return Promise.resolve();
      },
    } satisfies KeyCache,
    peek: (pk: string) => store.get(pk) ?? null,
    seed: (pk: string, value: string) => store.set(pk, value),
    get setCalls() {
      return setCalls;
    },
  };
};

// In-memory directory fake backed by a known map of key -> projectId.
const createFakeDirectory = (rows: Record<string, string>) => {
  let lookups = 0;
  return {
    directory: {
      findProjectId: (pk: string) => {
        lookups += 1;
        return Promise.resolve(rows[pk] ?? null);
      },
    } satisfies KeyDirectory,
    get lookups() {
      return lookups;
    },
  };
};

describe("createKeyResolver", () => {
  let fakeCache: ReturnType<typeof createFakeCache>;
  let fakeDir: ReturnType<typeof createFakeDirectory>;
  let resolver: KeyResolver;

  beforeEach(() => {
    fakeCache = createFakeCache();
    fakeDir = createFakeDirectory({ pk_valid: "proj_1" });
    resolver = createKeyResolver({
      cache: fakeCache.cache,
      directory: fakeDir.directory,
    });
  });

  it("returns a cached projectId without hitting the directory", async () => {
    fakeCache.seed("pk_valid", "proj_cached");

    const projectId = await resolver.resolve("pk_valid");

    expect(projectId).toBe("proj_cached");
    expect(fakeDir.lookups).toBe(0);
  });

  it("on cache miss looks up the directory and populates the cache", async () => {
    const projectId = await resolver.resolve("pk_valid");

    expect(projectId).toBe("proj_1");
    expect(fakeDir.lookups).toBe(1);
    expect(fakeCache.peek("pk_valid")).toBe("proj_1");
    expect(fakeCache.setCalls).toBe(1);
  });

  it("negative-caches an unknown key and rejects with InvalidApiKeyError", async () => {
    await expect(resolver.resolve("pk_unknown")).rejects.toThrow(
      InvalidApiKeyError
    );
    expect(fakeCache.peek("pk_unknown")).toBe(INVALID_MARKER);
  });

  it("rejects a key whose negative sentinel is already cached", async () => {
    fakeCache.seed("pk_revoked", INVALID_MARKER);

    await expect(resolver.resolve("pk_revoked")).rejects.toThrow(
      InvalidApiKeyError
    );
    // Sentinel short-circuits before any directory lookup.
    expect(fakeDir.lookups).toBe(0);
  });

  it("rejects a revoked key (directory returns null) and does not return a projectId", async () => {
    // A revoked key is absent from the directory (it filters revokedAt: null).
    await expect(resolver.resolve("pk_gone")).rejects.toThrow(
      InvalidApiKeyError
    );
    expect(fakeDir.lookups).toBe(1);
  });

  it("rejects an empty key without touching cache or directory", async () => {
    await expect(resolver.resolve("")).rejects.toThrow(InvalidApiKeyError);
    expect(fakeDir.lookups).toBe(0);
    expect(fakeCache.setCalls).toBe(0);
  });
});

describe("createSecretKeyResolver", () => {
  const SECRET = "sk_test_secret";

  let fakeCache: ReturnType<typeof createFakeCache>;
  let fakeDir: ReturnType<typeof createFakeDirectory>;
  let resolver: KeyResolver;

  beforeEach(() => {
    fakeCache = createFakeCache();
    // The directory (and cache) are keyed by the sha256 hash, never the raw
    // secret — mirrors the secretHash column lookup in Postgres.
    fakeDir = createFakeDirectory({ [hashSecret(SECRET)]: "proj_1" });
    resolver = createSecretKeyResolver({
      cache: fakeCache.cache,
      directory: fakeDir.directory,
    });
  });

  it("hashes the raw secret before directory lookup and cache writes", async () => {
    const projectId = await resolver.resolve(SECRET);

    expect(projectId).toBe("proj_1");
    expect(fakeCache.peek(hashSecret(SECRET))).toBe("proj_1");
    // The raw secret must never appear as a cache key.
    expect(fakeCache.peek(SECRET)).toBeNull();
  });

  it("rejects an unknown secret with InvalidApiKeyError and negative-caches its hash", async () => {
    await expect(resolver.resolve("sk_wrong")).rejects.toThrow(
      InvalidApiKeyError
    );
    expect(fakeCache.peek(hashSecret("sk_wrong"))).toBe(INVALID_MARKER);
  });

  it("rejects an empty secret without touching cache or directory", async () => {
    await expect((async () => await resolver.resolve(""))()).rejects.toThrow(
      InvalidApiKeyError
    );
    expect(fakeDir.lookups).toBe(0);
    expect(fakeCache.setCalls).toBe(0);
  });
});
