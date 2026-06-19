# `packages/db` — Databases & Local Infrastructure

Owns the Prisma client (Postgres) **and** the docker-compose stack that boots every persistence service used in development: Postgres, Redis, Redpanda, ClickHouse.

## Layout

```
src/
  index.ts                 # createPrismaClient() + default singleton (uses pgx adapter)
prisma/
  schema/
    schema.prisma          # Generator + datasource
    auth.prisma            # Better Auth tables (User, Session, Account, Verification)
    project.prisma         # Project + ApiKey models (consumed by apps/ingest)
  generated/               # Prisma Client output (gitignored, generated on `db:generate`)
clickhouse/
  init.sql                 # Mounted into the ClickHouse container; defines events table,
                           #   Kafka engine source on Redpanda topic `events`,
                           #   materialized view, and the events_daily aggregate.
docker-compose.yml         # postgres, redis, redpanda(+ topic init), clickhouse
```

## Scripts (run from repo root)

| Script                          | Purpose                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `bun run db:start`              | Boot all four services in the background                         |
| `bun run db:watch`              | Boot in the foreground (tail logs)                               |
| `bun run db:stop`               | Stop containers, keep volumes                                    |
| `bun run db:down`               | Stop containers and remove volumes                               |
| `bun run db:push`               | Apply Prisma schema to Postgres (dev only, no migration history) |
| `bun run db:migrate`            | Migrate **both** planes — Prisma (Postgres) then ClickHouse      |
| `bun run db:migrate:prisma`     | Prisma migration only (Postgres)                                 |
| `bun run db:migrate:clickhouse` | ClickHouse migrations only (`clickhouse/migrate.ts`)             |
| `bun run db:generate`           | Regenerate Prisma Client into `prisma/generated/`                |
| `bun run db:studio`             | Open Prisma Studio                                               |

## Service map

| Service    | Container port | Host port | Used by                                                                                          |
| ---------- | -------------- | --------- | ------------------------------------------------------------------------------------------------ |
| Postgres   | 5432           | 5432      | `apps/server` (Prisma), `apps/ingest`                                                            |
| Redis      | 6379           | 6379      | `apps/ingest` (key cache)                                                                        |
| Redpanda   | 9092 internal  | 19092     | `apps/ingest` (producer), ClickHouse (Kafka engine, uses internal 9092 over the compose network) |
| ClickHouse | 8123 / 9000    | 8123/9000 | `packages/api` (HTTP), ops                                                                       |

## Conventions

- **Schema changes are three-way.** A new event column means: update `producer.Event` in `apps/ingest`, the `events_queue` and `events` tables in `clickhouse/init.sql`, and any analytics query in `packages/api`. Forgetting one breaks the pipeline silently — rows just get dropped by the materialized view.
- **Prisma model edits** must be followed by `bun run db:generate` so dependent packages typecheck.
- **`init.sql` only runs on a _fresh_ ClickHouse volume.** To re-apply schema after a change: `bun run db:down` (drops volumes) then `bun run db:start`, or apply the change manually via `clickhouse-client`.
- **Default credentials are dev-only** (`analytics:analytics`, `postgres:password`). Production uses Dokploy-injected env on the OVH VPS.
- **Don't import `prisma/generated` directly** from other packages — go through `@sbox-analytics/db`.

## Out of scope

- Production deploy manifests — Dokploy config lives outside the repo.
- Query implementations — see `packages/api`.
