---
name: create-migration
description: Scaffold a schema change across both datastores — Prisma/Postgres (auth, API keys, orgs, billing) and ClickHouse (analytics events, MergeTree/Kafka-engine). Use when adding or altering tables/columns in s&box Analytics.
disable-model-invocation: true
---

# create-migration

s&box Analytics has **two** datastores. Decide which one(s) the change touches, then follow the matching flow. Never hand-edit applied migrations.

## 1. Pick the datastore

- **Postgres (Prisma)** — auth, API-key lookup, organizations, Polar billing, anything relational/transactional. Lives in `packages/db`.
- **ClickHouse** — analytics events, aggregations, anything on the ingest → MergeTree path. DDL lives with the ClickHouse setup (Kafka engine → MergeTree).
- A feature may need **both** (e.g. a new event type that also needs a project-level config row).

## 2. Postgres / Prisma flow

1. Edit the schema in `packages/db` (Prisma schema).
2. Generate a migration: `bun db:migrate` (turbo `-F @sbox-analytics/db db:migrate`). Use `bun db:push` only for throwaway local prototyping.
3. Regenerate client: `bun db:generate`.
4. Inspect with `bun db:studio` if needed.
5. Reference `prisma-cli` / `prisma-database-setup` skills for Prisma 7 specifics.

## 3. ClickHouse flow

1. Consult the `clickhouse-best-practices` and `clickhouse-architecture-advisor` skills before changing table engines or sort keys.
2. Write idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE`). For event tables, keep the Kafka-engine table, the MergeTree target, and the materialized view in sync — a column added to one must be added to all three.
3. Verify against the live schema using the `clickhouse` MCP server (introspect tables/columns, dry-run the query) before committing.
4. Update `packages/api/src/query-builder.ts` if column shapes changed.

## 4. Env vars (REQUIRED if the change adds config)

If the migration introduces any new env var, update the root `.env.example` AND the matching zod schema in `packages/env` (`server.ts`/`web.ts`) in the same change — every app `.env.example` is a symlink to root. (CLAUDE.md hard rule.)

## 5. Finish

- `bun fix` on changed files.
- Summarize: which datastore(s), files touched, and the exact command(s) the user must run to apply (migrations are not auto-applied).
