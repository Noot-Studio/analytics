import path from "node:path";

import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

// Resolves through the symlink at packages/db/.env → repo-root .env.
dotenv.config({
  path: path.join(import.meta.dirname, ".env"),
});

export default defineConfig({
  datasource: {
    url: env("DATABASE_URL"),
    // Only needed by commands that replay migration history (e.g. the CI
    // `migrate diff --from-migrations` drift check); unset in normal dev.
    ...(process.env.SHADOW_DATABASE_URL && {
      shadowDatabaseUrl: env("SHADOW_DATABASE_URL"),
    }),
  },
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  schema: path.join("prisma", "schema"),
});
