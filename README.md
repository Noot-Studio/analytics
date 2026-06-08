# sbox-analytics

Real-time game analytics built for [s&box](https://sbox.game) developers — player
behavior insights, session tracking, and performance monitoring, without the bloat of
general-purpose analytics tools.

Built with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack):
React, TanStack Router, Hono, oRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Bun** - Runtime environment
- **Prisma** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **ClickHouse + Redpanda** - High-throughput event ingestion and analytics store
- **Authentication** - Better-Auth
- **Oxlint** - Oxlint + Oxfmt (linting & formatting)
- **Turborepo** - Optimized monorepo build system

## Deployment (self-hosting)

The whole platform ships as Docker images orchestrated by `docker-compose.yaml` at
the repo root. Images are stateless and 12-factor (all config via env), so the same
artifacts run on plain Docker, Swarm, Nomad, or Kubernetes.

| Image    | Built from      | Runtime | Container port |
| -------- | --------------- | ------- | -------------- |
| `server` | `apps/server`   | Bun     | 3000           |
| `ingest` | `apps/ingest`   | Bun     | 8080           |
| `web`    | `apps/web`      | nginx   | 80             |
| `docs`   | `apps/fumadocs` | nginx   | 80             |

A one-shot `migrate` job pushes the Prisma schema to Postgres before `server` and
`ingest` start.

### Prerequisites

- Docker Engine with the Compose plugin (`docker compose`).

### Quick start

1. Create a `.env` next to `docker-compose.yaml`. Compose reads it for variable
   interpolation **and** for `COMPOSE_PROFILES`. Minimum:

   ```bash
   # Mode: `infra` bundles Postgres/Redis/Redpanda/ClickHouse; empty = managed infra.
   COMPOSE_PROFILES=infra

   # Required secrets
   BETTER_AUTH_SECRET=replace-with-32-plus-random-chars   # openssl rand -hex 32
   STEAM_API_KEY=replace-me                               # https://steamcommunity.com/dev/apikey

   # Public URLs — set to your real hostnames in production
   BETTER_AUTH_URL=http://localhost:3000                  # where `server` is reachable
   CORS_ORIGIN=http://localhost:3001                      # the dashboard origin
   VITE_SERVER_URL=http://localhost:3000                  # baked into the web bundle at build
   VITE_DOCS_URL=http://localhost:3002

   # Host ports (host:container)
   SERVER_PORT=3000
   INGEST_PORT=8080
   WEB_PORT=3001
   FUMADOCS_PORT=3002

   # Bundled-infra credentials (profile: infra)
   POSTGRES_DB=sbox-analytics
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=password
   CLICKHOUSE_DATABASE=analytics
   CLICKHOUSE_USER=analytics
   CLICKHOUSE_PASSWORD=analytics
   ```

2. Build and start everything:

   ```bash
   docker compose up -d --build
   ```

   Dashboard → `http://localhost:3001`, API → `:3000`, ingest → `:8080`, docs → `:3002`.

> `VITE_*` values are compiled into the web bundle, so changing them requires a
> `docker compose build web`. The other apps read config at runtime.

> The `docs` image prerenders its pages at build time, which needs host networking.
> Compose handles this (`build.network: host`). For a standalone build, add the flag:
> `docker build --network=host -f apps/fumadocs/Dockerfile -t docs .`

### Bundled vs. managed infrastructure

The data services live behind the `infra` Compose profile:

- **Bundled** (`COMPOSE_PROFILES=infra`) — Postgres, Redis, Redpanda, and ClickHouse
  run as containers with named volumes. One command, fully self-contained. The
  stateful services are **not** published to the host; the apps reach them over the
  Compose network.
- **Managed** (`COMPOSE_PROFILES=` empty) — only the app images run. Point the apps at
  your own services with the host/credential vars (connection strings are assembled
  from these, so a stray `DATABASE_URL` in a local `.env` can't leak in):

  ```bash
  POSTGRES_HOST=db.example.com            # POSTGRES_DB_PORT defaults to 5432
  POSTGRES_USER=sbox
  POSTGRES_PASSWORD=…
  POSTGRES_DB=sbox-analytics
  REDIS_HOST=cache.example.com            # REDIS_DB_PORT defaults to 6379
  KAFKA_HOST=broker.example.com           # KAFKA_DB_PORT defaults to 9092
  CLICKHOUSE_HOST=clickhouse.example.com  # CLICKHOUSE_DB_PORT defaults to 8123
  CLICKHOUSE_USER=…
  CLICKHOUSE_PASSWORD=…
  ```

  In managed mode you must apply `packages/db/clickhouse/init.sql` to your ClickHouse
  (it defines the events table, the Kafka-engine source, and the materialized views)
  and ensure the `events` topic exists on your broker.

> Bundled-infra credentials come from the same `POSTGRES_*` / `CLICKHOUSE_*` vars, so
> changing a password in `.env` is picked up by both the database and the apps.

### Scaling across a fleet

The app images are stateless; push them to a registry and pull them anywhere:

```bash
IMAGE_PREFIX=registry.example.com/sbox-analytics IMAGE_TAG=v1 docker compose build
IMAGE_PREFIX=registry.example.com/sbox-analytics IMAGE_TAG=v1 docker compose push
```

`server`, `ingest`, `web`, and `docs` scale horizontally. To run more than one
replica per app, **remove the published `ports`** from `docker-compose.yaml` (a host
port can bind only one container) and route traffic through your own load balancer /
ingress. Bump throughput on the pipeline by raising `KAFKA_PARTITIONS` and adding
ingest replicas behind the LB.

### Upgrades

```bash
git pull
docker compose up -d --build      # rebuilds images; `migrate` re-pushes the schema
```

ClickHouse `init.sql` only runs on a **fresh** volume. For schema changes after the
first boot, apply the files in `packages/db/clickhouse/migrations/` manually via
`clickhouse-client`.

### Security notes

- Set a strong, unique `BETTER_AUTH_SECRET` (≥32 chars) and real `CLICKHOUSE_PASSWORD`
  / `POSTGRES_PASSWORD` — the defaults are dev-only.
- The bundled data services are unpublished by design. Keep them off the public
  network and never expose Postgres/ClickHouse directly to the internet.
- Put TLS termination (a reverse proxy / load balancer / ingress) in front of the
  published app ports.

## Project Structure

```
sbox-analytics/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router) — Dockerfile
│   ├── server/      # Backend API (Hono, ORPC) — Dockerfile
│   ├── ingest/      # High-throughput event ingestion API (Hono + Bun) — Dockerfile
│   └── fumadocs/    # Public documentation site (fumadocs) — Dockerfile
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Postgres (Prisma), ClickHouse init, Redpanda, Redis (Docker Compose)
└── docker-compose.yaml  # Self-host deployment (see "Deployment" above)
```

## Development

Local setup, scripts, and UI customization live in [CONTRIBUTING.md](./CONTRIBUTING.md).
