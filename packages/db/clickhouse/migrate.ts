/**
 * Applies every SQL file in clickhouse/migrations/ in filename order.
 * All migrations are written to be idempotent (CREATE/ALTER ... IF NOT
 * EXISTS), so re-running the full set on every deploy is safe — there is
 * no migration-history table.
 *
 * Run from packages/db: `bun run clickhouse/migrate.ts`
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@clickhouse/client";
import { env } from "@sbox-analytics/env/server";

const MIGRATIONS_DIR = path.join(import.meta.dirname, "migrations");
const STATEMENT_SEPARATOR = /;\s*$/mu;

const client = createClient({
  password: env.CLICKHOUSE_PASSWORD,
  url: env.CLICKHOUSE_URL,
  username: env.CLICKHOUSE_USER,
});

const entries = await readdir(MIGRATIONS_DIR);
const files = entries.filter((f) => f.endsWith(".sql")).toSorted();

for (const file of files) {
  const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf-8");
  const statements = sql
    .split(STATEMENT_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const statement of statements) {
    await client.command({ query: statement });
  }
  process.stdout.write(`applied ${file} (${statements.length} statements)\n`);
}

await client.close();
