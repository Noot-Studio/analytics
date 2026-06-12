import prisma from "@sbox-analytics/db";
import { env } from "@sbox-analytics/env/server";
import { usageCounterKey, usagePeriod } from "@sbox-analytics/events";
import { RedisClient } from "bun";

import { orgProcedure } from "../index";

const redis = new RedisClient(env.REDIS_URL);

// Monthly ingested-event usage for the active organization. Self-hosted
// deployments (billing disabled) report no limit so the dashboard never shows
// quota UI (docs/adr/0002).
export const usageRouter = {
  current: orgProcedure.handler(async ({ context }) => {
    if (!env.BILLING_ENABLED) {
      return { billingEnabled: false as const, limit: null, used: 0 };
    }

    const { organizationId } = context;
    const org = await prisma.organization.findUnique({
      select: { eventLimit: true },
      where: { id: organizationId },
    });
    const limit = org?.eventLimit ?? env.FREE_PLAN_MONTHLY_EVENT_LIMIT;

    const counter = await redis.get(
      usageCounterKey(organizationId, usagePeriod(new Date()))
    );
    const used = counter === null ? 0 : Number(counter);

    return { billingEnabled: true as const, limit, used };
  }),
};
