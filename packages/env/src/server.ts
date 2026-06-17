import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    // Cloud-only quota enforcement. Self-hosted deployments leave this off and
    // run fully featured with no limits (docs/adr/0002).
    BILLING_ENABLED: z.stringbool().default(false),
    CLICKHOUSE_DATABASE: z.string().min(1).default("analytics"),
    CLICKHOUSE_PASSWORD: z.string().default("analytics"),
    CLICKHOUSE_URL: z.url().default("http://localhost:8123"),
    CLICKHOUSE_USER: z.string().min(1).default("analytics"),
    CORS_ORIGIN: z.url(),
    DATABASE_URL: z.string().min(1),
    EMAIL_FROM: z
      .string()
      .min(1)
      .default("s&box Analytics <onboarding@resend.dev>"),
    // Monthly ingested-event cap for cloud free-plan orgs (those without a
    // custom Organization.eventLimit). Only enforced when BILLING_ENABLED.
    FREE_PLAN_MONTHLY_EVENT_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .default(500_000),
    INGEST_PORT: z.coerce.number().int().positive().default(8080),
    KAFKA_BROKERS: z.string().min(1).default("localhost:19092"),
    KAFKA_EVENTS_TOPIC: z.string().min(1).default("events"),
    KAFKA_SPATIAL_TOPIC: z.string().min(1).default("spatial_cells"),
    KAFKA_TRAJECTORY_TOPIC: z.string().min(1).default("trajectory"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    RESEND_API_KEY: z.string().min(1).optional(),
    SERVER_PORT: z.coerce.number().int().positive().default(3000),
    STEAM_API_KEY: z.string().min(1),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
