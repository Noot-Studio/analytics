import { createChClient } from "@sbox-analytics/api/ch-client";
import { env } from "@sbox-analytics/env/server";
import { batchSchema } from "@sbox-analytics/events";
import { initLogger } from "evlog";
import { evlog } from "evlog/hono";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";

import { BatchError, partitionBatch, partitionedSize } from "./fanout";
import {
  createRedisKeyResolver,
  createRedisSecretKeyResolver,
  InvalidApiKeyError,
} from "./keys";
import { createProducer } from "./producer";
import { createRedisQuota, unlimitedQuota } from "./quota";
import { MAX_BODY_BYTES, MAX_PROPERTIES_BYTES } from "./schema";
import { createSpatialRoutes } from "./spatial";

initLogger({
  env: { service: "sbox-analytics-ingest" },
});

const keys = createRedisKeyResolver(env.REDIS_URL);
// Quota enforcement is cloud-only; self-hosted runs unlimited (docs/adr/0002).
const quota = env.BILLING_ENABLED
  ? createRedisQuota({
      defaultLimit: env.FREE_PLAN_MONTHLY_EVENT_LIMIT,
      redisUrl: env.REDIS_URL,
    })
  : unlimitedQuota;
const producer = await createProducer({
  brokers: env.KAFKA_BROKERS.split(",").map((b) => b.trim()),
});

const app = new Hono<EvlogVariables>();

app.use(evlog());

app.get("/healthz", (c) => c.text("ok"));

// Editor-tool read path: voxel/scene queries. Authenticated with the SECRET
// key (sk_), not the publishable key — the publishable key ships inside game
// builds and must never grant read access to analytics data.
const secretKeys = createRedisSecretKeyResolver(env.REDIS_URL);
app.route(
  "/v1/spatial",
  createSpatialRoutes({ ch: createChClient(), keys: secretKeys })
);

app.post(
  "/v1/events",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: () => {
      throw new HTTPException(413, { message: "body too large" });
    },
  }),
  async (c) => {
    const apiKey = c.req.header("x-api-key") ?? "";

    let projectId: string;
    try {
      projectId = await keys.resolve(apiKey);
    } catch (error) {
      if (error instanceof InvalidApiKeyError) {
        throw new HTTPException(401, { message: "invalid api key" });
      }
      throw new HTTPException(500, { message: "key lookup failed" });
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = batchSchema.safeParse(raw);
    if (!parsed.success) {
      throw new HTTPException(400, { message: "invalid payload" });
    }

    // Spatial batch events (spatial_cells / trajectory) fan out into many rows
    // on dedicated topics; everything else maps 1:1 to the events topic.
    let batch: ReturnType<typeof partitionBatch>;
    try {
      batch = partitionBatch(
        parsed.data.events,
        projectId,
        MAX_PROPERTIES_BYTES
      );
    } catch (error) {
      if (error instanceof BatchError) {
        throw new HTTPException(error.status as 400, {
          message: error.message,
        });
      }
      throw error;
    }

    const total = partitionedSize(batch);

    // Over-quota batches are dropped, not rejected: a 2xx keeps game-side SDKs
    // from retry-storming while the org is capped for the month.
    const admitted = await quota.admit(projectId, total);
    if (!admitted) {
      return c.json(
        { accepted: 0, dropped: total, reason: "quota_exceeded" },
        202
      );
    }

    try {
      await producer.publish(env.KAFKA_EVENTS_TOPIC, batch.normal);
      await producer.publish(env.KAFKA_SPATIAL_TOPIC, batch.cells);
      await producer.publish(env.KAFKA_TRAJECTORY_TOPIC, batch.points);
    } catch {
      throw new HTTPException(502, { message: "publish failed" });
    }

    return c.json({ accepted: total }, 202);
  }
);

const server = Bun.serve({
  fetch: app.fetch,
  port: env.INGEST_PORT,
});

console.log(`ingest listening on http://localhost:${server.port}`);

const shutdown = async (signal: NodeJS.Signals) => {
  console.log(`received ${signal}, shutting down`);
  server.stop();
  await producer.disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
