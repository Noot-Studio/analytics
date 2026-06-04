import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
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
    INGEST_PORT: z.coerce.number().int().positive().default(8080),
    KAFKA_BROKERS: z.string().min(1).default("localhost:19092"),
    KAFKA_EVENTS_TOPIC: z.string().min(1).default("events"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    RESEND_API_KEY: z.string().min(1).optional(),
    SERVER_PORT: z.coerce.number().int().positive().default(3000),
    STEAM_API_KEY: z.string().min(1),
  },
});
