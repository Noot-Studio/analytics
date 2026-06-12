import prisma from "@sbox-analytics/db";
import {
  orgPlanCacheKey,
  usageCounterKey,
  usagePeriod,
} from "@sbox-analytics/events";
import { RedisClient } from "bun";

const PLAN_TTL_SECONDS = 5 * 60;
// Counters outlive their month by a buffer so the dashboard can still show
// last month's usage, then expire on their own.
const COUNTER_TTL_SECONDS = 62 * 24 * 60 * 60;

// Monthly quota for an organization. eventLimit null falls back by plan:
// free-plan default for Free, unlimited for Custom.
export interface OrgPlan {
  organizationId: string;
  plan: "Free" | "Custom";
  eventLimit: number | null;
}

// The prisma lookup behind a port: maps a project to its organization's plan.
export interface PlanDirectory {
  findPlan(projectId: string): Promise<OrgPlan | null>;
}

// The redis cache behind a port. Values are JSON-serialized OrgPlan; del() is
// used by the control plane to invalidate when an org's eventLimit changes.
export interface PlanCache {
  get(projectId: string): Promise<string | null>;
  set(projectId: string, value: string, ttlSeconds: number): Promise<void>;
  del(projectId: string): Promise<void>;
}

// Monthly per-org event counter behind a port (redis in production).
export interface UsageCounter {
  get(organizationId: string, period: string): Promise<number>;
  add(organizationId: string, period: string, count: number): Promise<void>;
}

export interface Quota {
  // True when the batch may be ingested; counts it against the org's monthly
  // usage. False means the org is over quota and the batch must be dropped.
  admit(projectId: string, count: number): Promise<boolean>;
}

// Self-hosted / billing-disabled wiring: no limits, no counting (docs/adr/0002).
export const unlimitedQuota: Quota = {
  admit: () => Promise.resolve(true),
};

// Holds the quota policy over injected ports, so it is fully testable with
// in-memory fakes. The check is read-then-increment without a transaction:
// concurrent batches can overshoot the cap slightly, which is fine for a
// soft infrastructure limit.
export const createQuota = ({
  directory,
  cache,
  counter,
  defaultLimit,
  now = () => new Date(),
}: {
  directory: PlanDirectory;
  cache: PlanCache;
  counter: UsageCounter;
  defaultLimit: number;
  now?: () => Date;
}): Quota => {
  const resolvePlan = async (projectId: string): Promise<OrgPlan | null> => {
    const cached = await cache.get(projectId);
    if (cached !== null) {
      return JSON.parse(cached) as OrgPlan;
    }
    const plan = await directory.findPlan(projectId);
    if (plan === null) {
      return null;
    }
    await cache.set(projectId, JSON.stringify(plan), PLAN_TTL_SECONDS);
    return plan;
  };

  return {
    async admit(projectId: string, count: number): Promise<boolean> {
      const plan = await resolvePlan(projectId);
      // The key resolver already proved the project exists, so a missing plan
      // is a control-plane inconsistency — fail open rather than drop events.
      if (plan === null) {
        return true;
      }
      // Custom plans without an explicit cap are unlimited; usage is still
      // counted so the dashboard can report it.
      const limit =
        plan.eventLimit ??
        (plan.plan === "Custom" ? Number.POSITIVE_INFINITY : defaultLimit);
      const period = usagePeriod(now());
      const used = await counter.get(plan.organizationId, period);
      if (used >= limit) {
        return false;
      }
      await counter.add(plan.organizationId, period, count);
      return true;
    },
  };
};

const prismaPlanDirectory: PlanDirectory = {
  async findPlan(projectId: string): Promise<OrgPlan | null> {
    const row = await prisma.project.findUnique({
      select: {
        organization: { select: { eventLimit: true, id: true, plan: true } },
      },
      where: { id: projectId },
    });
    if (!row) {
      return null;
    }
    return {
      eventLimit: row.organization.eventLimit,
      organizationId: row.organization.id,
      plan: row.organization.plan,
    };
  },
};

// Production wiring: prisma-backed directory + redis-backed cache and counter.
export const createRedisQuota = ({
  redisUrl,
  defaultLimit,
}: {
  redisUrl: string;
  defaultLimit: number;
}): Quota => {
  const redis = new RedisClient(redisUrl);
  const cache: PlanCache = {
    async del(projectId) {
      await redis.del(orgPlanCacheKey(projectId));
    },
    get: (projectId) => redis.get(orgPlanCacheKey(projectId)),
    async set(projectId, value, ttlSeconds) {
      await redis.send("SET", [
        orgPlanCacheKey(projectId),
        value,
        "EX",
        String(ttlSeconds),
      ]);
    },
  };
  const usage: UsageCounter = {
    async add(organizationId, period, count) {
      const key = usageCounterKey(organizationId, period);
      await redis.send("INCRBY", [key, String(count)]);
      // NX: only set the TTL when the counter is new, so increments never
      // push the expiry out indefinitely.
      await redis.send("EXPIRE", [key, String(COUNTER_TTL_SECONDS), "NX"]);
    },
    async get(organizationId, period) {
      const value = await redis.get(usageCounterKey(organizationId, period));
      return value === null ? 0 : Number(value);
    },
  };
  return createQuota({
    cache,
    counter: usage,
    defaultLimit,
    directory: prismaPlanDirectory,
  });
};
