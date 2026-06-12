import { beforeEach, describe, expect, it } from "bun:test";

import { createQuota, unlimitedQuota } from "./quota";
import type {
  OrgPlan,
  PlanCache,
  PlanDirectory,
  Quota,
  UsageCounter,
} from "./quota";

const DEFAULT_LIMIT = 100;
const FIXED_NOW = new Date("2026-06-12T10:00:00Z");
const PERIOD = "2026-06";

// In-memory cache fake, plus call counters so tests can assert population.
const createFakeCache = () => {
  const store = new Map<string, string>();
  let setCalls = 0;
  return {
    cache: {
      del: (projectId: string) => {
        store.delete(projectId);
        return Promise.resolve();
      },
      get: (projectId: string) => Promise.resolve(store.get(projectId) ?? null),
      set: (projectId: string, value: string) => {
        setCalls += 1;
        store.set(projectId, value);
        return Promise.resolve();
      },
    } satisfies PlanCache,
    seed: (projectId: string, plan: OrgPlan) =>
      store.set(projectId, JSON.stringify(plan)),
    get setCalls() {
      return setCalls;
    },
  };
};

// In-memory directory fake backed by a known map of projectId -> plan.
const createFakeDirectory = (rows: Record<string, OrgPlan>) => {
  let lookups = 0;
  return {
    directory: {
      findPlan: (projectId: string) => {
        lookups += 1;
        return Promise.resolve(rows[projectId] ?? null);
      },
    } satisfies PlanDirectory,
    get lookups() {
      return lookups;
    },
  };
};

const key = (orgId: string, period: string) => `${orgId}:${period}`;

// In-memory monthly counter fake keyed by orgId:period.
const createFakeCounter = () => {
  const store = new Map<string, number>();
  return {
    counter: {
      add: (orgId: string, period: string, count: number) => {
        store.set(
          key(orgId, period),
          (store.get(key(orgId, period)) ?? 0) + count
        );
        return Promise.resolve();
      },
      get: (orgId: string, period: string) =>
        Promise.resolve(store.get(key(orgId, period)) ?? 0),
    } satisfies UsageCounter,
    peek: (orgId: string, period: string) => store.get(key(orgId, period)) ?? 0,
    seed: (orgId: string, period: string, used: number) =>
      store.set(key(orgId, period), used),
  };
};

describe("createQuota", () => {
  let fakeCache: ReturnType<typeof createFakeCache>;
  let fakeDir: ReturnType<typeof createFakeDirectory>;
  let fakeCounter: ReturnType<typeof createFakeCounter>;
  let quota: Quota;

  beforeEach(() => {
    fakeCache = createFakeCache();
    fakeDir = createFakeDirectory({
      proj_custom: { eventLimit: 1000, organizationId: "org_custom" },
      proj_free: { eventLimit: null, organizationId: "org_free" },
    });
    fakeCounter = createFakeCounter();
    quota = createQuota({
      cache: fakeCache.cache,
      counter: fakeCounter.counter,
      defaultLimit: DEFAULT_LIMIT,
      directory: fakeDir.directory,
      now: () => FIXED_NOW,
    });
  });

  it("admits a batch under the free-plan default and counts it", async () => {
    const admitted = await quota.admit("proj_free", 10);

    expect(admitted).toBe(true);
    expect(fakeCounter.peek("org_free", PERIOD)).toBe(10);
  });

  it("rejects a batch once the free-plan default is reached and stops counting", async () => {
    fakeCounter.seed("org_free", PERIOD, DEFAULT_LIMIT);

    const admitted = await quota.admit("proj_free", 1);

    expect(admitted).toBe(false);
    expect(fakeCounter.peek("org_free", PERIOD)).toBe(DEFAULT_LIMIT);
  });

  it("uses the org's custom eventLimit over the default", async () => {
    fakeCounter.seed("org_custom", PERIOD, DEFAULT_LIMIT + 1);

    const admitted = await quota.admit("proj_custom", 5);

    expect(admitted).toBe(true);
    expect(fakeCounter.peek("org_custom", PERIOD)).toBe(DEFAULT_LIMIT + 6);
  });

  it("resets usage on a new month because the period key changes", async () => {
    fakeCounter.seed("org_free", "2026-05", DEFAULT_LIMIT);

    const admitted = await quota.admit("proj_free", 1);

    expect(admitted).toBe(true);
    expect(fakeCounter.peek("org_free", PERIOD)).toBe(1);
  });

  it("on cache miss looks up the directory and populates the cache", async () => {
    await quota.admit("proj_free", 1);
    await quota.admit("proj_free", 1);

    expect(fakeDir.lookups).toBe(1);
    expect(fakeCache.setCalls).toBe(1);
  });

  it("serves the plan from cache without hitting the directory", async () => {
    fakeCache.seed("proj_free", { eventLimit: 2, organizationId: "org_free" });

    await quota.admit("proj_free", 1);

    expect(fakeDir.lookups).toBe(0);
  });

  it("fails open when the project has no plan (control-plane inconsistency)", async () => {
    const admitted = await quota.admit("proj_unknown", 5);

    expect(admitted).toBe(true);
    expect(fakeCache.setCalls).toBe(0);
  });
});

describe("unlimitedQuota", () => {
  it("admits everything", async () => {
    expect(await unlimitedQuota.admit("proj_any", 1_000_000)).toBe(true);
  });
});
