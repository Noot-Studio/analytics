import { env } from "@sbox-analytics/env/server";
import type { ClickHouseEvent } from "@sbox-analytics/events";
import { batchSchema, toClickHouseEvent } from "@sbox-analytics/events";
import { initLogger } from "evlog";
import { evlog } from "evlog/hono";
import type { EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";

import { createRedisKeyResolver, InvalidApiKeyError } from "./keys";
import { createProducer } from "./producer";
import { MAX_BODY_BYTES, MAX_PROPERTIES_BYTES } from "./schema";

initLogger({
  env: { service: "sbox-analytics-ingest" },
});

const keys = createRedisKeyResolver(env.REDIS_URL);
const producer = await createProducer({
  brokers: env.KAFKA_BROKERS.split(",").map((b) => b.trim()),
  topic: env.KAFKA_EVENTS_TOPIC,
});

const app = new Hono<EvlogVariables>();

app.use(evlog());

app.get("/healthz", (c) => c.text("ok"));

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

    const records: ClickHouseEvent[] = [];
    for (const ev of parsed.data.events) {
      const properties = ev.properties ? JSON.stringify(ev.properties) : "{}";
      if (properties.length > MAX_PROPERTIES_BYTES) {
        throw new HTTPException(400, { message: "properties too large" });
      }
      records.push(toClickHouseEvent(ev, projectId, properties));
    }

    try {
      await producer.publish(records);
    } catch {
      throw new HTTPException(502, { message: "publish failed" });
    }

    return c.json({ accepted: records.length }, 202);
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
