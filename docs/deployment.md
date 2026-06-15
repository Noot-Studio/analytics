# Deployment

How to self-host s&box Analytics — the whole platform at once, or one app at a
time — with **Docker images** or **Nixpacks**.

- **Docker** is the supported, CI-built path. Every push builds the app images
  and publishes them to GHCR (see [releasing.md](./releasing.md)), and
  `docker-compose.yaml` orchestrates the whole stack — apps plus optional
  bundled data services — with a single command. Best for running everything on
  one host and for serving the static apps behind nginx.
- **Nixpacks** is the platform-native alternative. Each app carries a committed
  `nixpacks.toml`, so PaaS targets that speak Nixpacks — [Dokploy](https://dokploy.com),
  [Railway](https://railway.com), [Coolify](https://coolify.io) — can build and
  run any single app without a Dockerfile. You bring your own data services.

Either way the images/processes are stateless and 12-factor (all config via
env), so they run on plain Docker, Swarm, Nomad, Kubernetes, or any Nixpacks PaaS.

## The apps

| App        | Source          | Build (Turbo)       | Output                       | Runtime        | Port   |
| ---------- | --------------- | ------------------- | ---------------------------- | -------------- | ------ |
| **server** | `apps/server`   | `--filter=server`   | `apps/server/dist/index.mjs` | Bun            | `3000` |
| **ingest** | `apps/ingest`   | `--filter=ingest`   | `apps/ingest/dist/index.mjs` | Bun            | `8080` |
| **web**    | `apps/web`      | `--filter=web`      | `apps/web/dist` (static SPA) | static (nginx) | `80`   |
| **docs**   | `apps/fumadocs` | `--filter=fumadocs` | `apps/fumadocs/dist/client`  | static (nginx) | `80`   |

`server` and `ingest` are Bun services. `web` and `docs` compile to static
files; the Docker images serve them with nginx, the Nixpacks configs with
`serve`.

## Data services

The apps are stateless; persistent state lives in four external services:

| Service              | Used by        | Notes                                                         |
| -------------------- | -------------- | ------------------------------------------------------------- |
| **PostgreSQL** 17    | server, ingest | Control plane (orgs, projects, API keys). Managed by Prisma.  |
| **Redis** 8          | server, ingest | Sessions, rate limiting, ingest quota counters.               |
| **Redpanda / Kafka** | ingest         | Event buffer. ingest produces; ClickHouse consumes.           |
| **ClickHouse** 24.10 | server, ingest | Analytics store. Holds the events table + materialized views. |

With Docker Compose you can let the `infra` profile run these for you
([Path A](#path-a--docker)). With Nixpacks — or Compose in managed mode — you
provision them yourself and point the apps at them with the env vars below.

## Environment

Every app reads config from the environment. `apps/server` and `apps/ingest`
share one schema (`packages/env/src/server.ts`) and validate it on boot — a
missing or malformed value crashes the process immediately. `apps/web` only sees
build-time `VITE_*` values, baked into the bundle. `apps/fumadocs` needs none.

| Variable              | Apps           | Required | Default                                   | Notes                                                    |
| --------------------- | -------------- | -------- | ----------------------------------------- | -------------------------------------------------------- |
| `BETTER_AUTH_SECRET`  | server, ingest | ✅       | —                                         | ≥32 chars. `openssl rand -hex 32`.                       |
| `BETTER_AUTH_URL`     | server, ingest | ✅       | —                                         | Public URL where `server` is reachable.                  |
| `STEAM_API_KEY`       | server, ingest | ✅       | —                                         | https://steamcommunity.com/dev/apikey                    |
| `CORS_ORIGIN`         | server, ingest | ✅       | —                                         | Dashboard origin (where `web` is served).                |
| `DATABASE_URL`        | server, ingest | ✅       | —                                         | Postgres connection string.                              |
| `REDIS_URL`           | server, ingest | —        | `redis://localhost:6379`                  | Redis connection string.                                 |
| `KAFKA_BROKERS`       | server, ingest | —        | `localhost:19092`                         | Comma-separated broker list.                             |
| `KAFKA_EVENTS_TOPIC`  | server, ingest | —        | `events`                                  | Must exist on the broker.                                |
| `CLICKHOUSE_URL`      | server, ingest | —        | `http://localhost:8123`                   | ClickHouse HTTP endpoint.                                |
| `CLICKHOUSE_DATABASE` | server, ingest | —        | `analytics`                               |                                                          |
| `CLICKHOUSE_USER`     | server, ingest | —        | `analytics`                               |                                                          |
| `CLICKHOUSE_PASSWORD` | server, ingest | —        | `analytics`                               | Set a real value in production.                          |
| `SERVER_PORT`         | server         | —        | `3000`                                    | Port `server` binds.                                     |
| `INGEST_PORT`         | ingest         | —        | `8080`                                    | Port `ingest` binds.                                     |
| `RESEND_API_KEY`      | server         | —        | —                                         | Team-invite emails. Without it, invite links are logged. |
| `EMAIL_FROM`          | server         | —        | `s&box Analytics <onboarding@resend.dev>` | Sender for invites.                                      |
| `NODE_ENV`            | server, ingest | —        | `development`                             | Set `production` when you deploy.                        |
| `VITE_SERVER_URL`     | web (build)    | ✅       | —                                         | Baked in. Public URL of `server`.                        |
| `VITE_DOCS_URL`       | web (build)    | ✅       | —                                         | Baked in. Public URL of `docs`.                          |

> **Cloud billing is off by default.** `BILLING_ENABLED` defaults to `false`, so
> self-hosted deployments run fully featured with no event limits
> ([ADR 0002](./adr/0002-pricing-applies-to-hosting-not-software.md)). Leave it
> unset.

`ingest` validates the full server schema even though it doesn't use auth or
Steam directly, so set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `STEAM_API_KEY`,
and `CORS_ORIGIN` for it too (any valid values satisfy the schema).

## Database migrations

Both stores must be migrated **before** `server` and `ingest` start, and again
on every upgrade:

- **Postgres** — `prisma migrate deploy` applies the committed history in
  `packages/db/prisma/migrations/`. Never use `prisma db push` against
  production; it has no history and can drop data.
- **ClickHouse** — `packages/db/clickhouse/migrate.ts` applies every file in
  `packages/db/clickhouse/migrations/` in filename order. There is no history
  table, so the migrations are idempotent and safe to re-run.

`packages/db` wraps both as `bun run db:deploy`
(`prisma migrate deploy && bun run clickhouse/migrate.ts`). The `migrate` Docker
image and the `migrate` Compose service run exactly this. See
[releasing.md](./releasing.md#database-migrations) for baselining a database
that predates the migration history.

> In **managed mode** (you bring ClickHouse), also apply
> `packages/db/clickhouse/init.sql` once — it defines the events table, the
> Kafka-engine source, and the materialized views — and make sure the
> `KAFKA_EVENTS_TOPIC` exists on your broker. Compose's bundled ClickHouse does
> this automatically on a fresh volume.

---

## Path A — Docker

### Prerequisites

- Docker Engine with the Compose plugin (`docker compose`).

### Whole stack with Compose

The repo-root `docker-compose.yaml` runs all four apps, a one-shot `migrate`
job, and — under the `infra` profile — bundled Postgres, Redis, Redpanda, and
ClickHouse.

1. Create a `.env` next to `docker-compose.yaml`. Compose reads it for variable
   interpolation **and** for `COMPOSE_PROFILES`. Minimum:

   ```bash
   # Mode: `infra` bundles the data services; empty = bring your own (managed).
   COMPOSE_PROFILES=infra

   # Required secrets
   BETTER_AUTH_SECRET=replace-with-32-plus-random-chars   # openssl rand -hex 32
   STEAM_API_KEY=replace-me                               # steamcommunity.com/dev/apikey

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

   Dashboard → `http://localhost:3001`, API → `:3000`, ingest → `:8080`,
   docs → `:3002`. The `migrate` job runs first and `server`/`ingest` wait for
   it to finish.

> `VITE_*` values are compiled into the web bundle, so changing them needs a
> `docker compose build web`. The other apps read config at runtime.

> The `docs` image prerenders its pages at build time, which needs host
> networking. Compose handles this (`build.network: host`). For a standalone
> build, add the flag:
> `docker build --network=host -f apps/fumadocs/Dockerfile -t docs .`

#### Bundled vs. managed infrastructure

Each of the four data services has its own Compose profile, plus a shared
`infra` umbrella. List the ones to **bundle** in `COMPOSE_PROFILES`; omit a
service to run it **managed** (external) and point the app env at it.

- **Bundled** — the service runs as a container with a named volume, unpublished;
  the apps reach it over the Compose network.
- **Managed** — the service is left out; set its `*_HOST` + credential vars so the
  apps connect to your own instance. Connection strings are assembled from these
  parts, so a stray `DATABASE_URL` in a local `.env` can't leak localhost into a
  container.

| Setup                         | `COMPOSE_PROFILES`          | Bundled                               | You provide                    |
| ----------------------------- | --------------------------- | ------------------------------------- | ------------------------------ |
| All bundled (default)         | `infra`                     | Postgres, Redis, Redpanda, ClickHouse | —                              |
| Managed Postgres              | `redis,redpanda,clickhouse` | Redis, Redpanda, ClickHouse           | Postgres                       |
| Managed Postgres + Redis      | `redpanda,clickhouse`       | Redpanda, ClickHouse                  | Postgres, Redis                |
| Managed Postgres + ClickHouse | `redis`                     | Redis                                 | Postgres, Redpanda, ClickHouse |
| Fully managed                 | _(empty)_                   | —                                     | all four                       |

> **ClickHouse and Redpanda are a pipeline pair.** ClickHouse's Kafka-engine
> table reads from the broker, so the bundled `clickhouse` service `depends_on`
> `redpanda`. Bundle or manage the two together — bundling ClickHouse without
> Redpanda fails fast at startup
> (`depends on undefined service "redpanda"`).

Set the host/credential vars for every service you manage:

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

When you manage ClickHouse, apply `packages/db/clickhouse/init.sql` to it and
ensure the `events` topic exists on your broker (see
[migrations](#database-migrations)). The bundled ClickHouse does both
automatically on a fresh volume.

**Managed database on the same host (Dokploy, etc.).** When the managed service
runs as a sibling container behind an orchestrator, the app services must share
its Docker network to resolve `*_HOST`. The base compose keeps its own project
network, so use the **`docker-compose.dokploy.yml`** overlay: it leaves the base
portable and attaches `server`, `ingest`, `web`, `docs`, and the one-shot
`migrate` job to the external `dokploy-network` where a Dokploy-managed Postgres
lives. Point your Dokploy Compose service's file path at it. Without it, `migrate`
can't reach Postgres, loops on `P1001`, and `server`/`ingest` never leave
`Created`.

### A single app from a prebuilt image

CI publishes every app to GHCR, so you can pull and run one without a build:

```
ghcr.io/noot-studio/sbox-analytics/<app>:<tag>
```

`<app>` is `server`, `ingest`, `web`, `docs`, or `migrate`; `<tag>` is a release
version (`1.2.3`), `latest` (default branch), a branch name, or `sha-<commit>`.

```bash
# Run the migration job once against your databases.
docker run --rm \
  -e DATABASE_URL=postgresql://… \
  -e CLICKHOUSE_URL=http://… -e CLICKHOUSE_USER=… -e CLICKHOUSE_PASSWORD=… \
  ghcr.io/noot-studio/sbox-analytics/migrate:latest \
  sh -c 'cd packages/db && bun run db:deploy'

# Then run the API.
docker run -d --name server -p 3000:3000 \
  -e BETTER_AUTH_SECRET=… -e BETTER_AUTH_URL=https://api.example.com \
  -e STEAM_API_KEY=… -e CORS_ORIGIN=https://app.example.com \
  -e DATABASE_URL=postgresql://… -e REDIS_URL=redis://… \
  -e KAFKA_BROKERS=… -e CLICKHOUSE_URL=http://… \
  -e CLICKHOUSE_USER=… -e CLICKHOUSE_PASSWORD=… \
  ghcr.io/noot-studio/sbox-analytics/server:latest
```

`ingest` is identical with `-p 8080:8080` and the `ingest` image. `web` and
`docs` are nginx images on port `80` — but because `web` bakes its `VITE_*` URLs
at **build** time, the prebuilt image points at `localhost`. For real hostnames,
rebuild it (see below).

### Building one app image locally

All Dockerfiles take the **repo root** as the build context:

```bash
# server / ingest
docker build -f apps/server/Dockerfile -t server .
docker build -f apps/ingest/Dockerfile -t ingest .

# web — pass the public URLs as build args (they are baked in)
docker build -f apps/web/Dockerfile -t web \
  --build-arg VITE_SERVER_URL=https://api.example.com \
  --build-arg VITE_DOCS_URL=https://docs.example.com .

# docs — needs host networking for the prerender crawl
docker build --network=host -f apps/fumadocs/Dockerfile -t docs .
```

### Pushing to your own registry

The Compose images are named from `IMAGE_PREFIX`/`IMAGE_TAG`, so you can build,
push, and pull them anywhere:

```bash
IMAGE_PREFIX=registry.example.com/sbox-analytics IMAGE_TAG=v1 docker compose build
IMAGE_PREFIX=registry.example.com/sbox-analytics IMAGE_TAG=v1 docker compose push
```

---

## Path B — Nixpacks

Each app ships a `nixpacks.toml` that encodes its install, build, and start
steps for the Bun monorepo, so a Nixpacks PaaS can deploy any one app on its own.
Create one service per app and point its **config file** at the app's
`nixpacks.toml`:

| App    | Nixpacks config file          | Listens on       |
| ------ | ----------------------------- | ---------------- |
| server | `apps/server/nixpacks.toml`   | `$PORT` (→ 3000) |
| ingest | `apps/ingest/nixpacks.toml`   | `$PORT` (→ 8080) |
| web    | `apps/web/nixpacks.toml`      | `$PORT` (→ 80)   |
| docs   | `apps/fumadocs/nixpacks.toml` | `$PORT` (→ 80)   |

> Point the **build context at the repo root**, not the app subfolder — the
> Bun workspace install needs the root `bun.lock` and every package. On Dokploy,
> set the Nixpacks config path; on Railway, set "Config as code"; on Coolify,
> set the Nixpacks configuration file.

### How each config is wired

- **Toolchain** — `nixPkgs = ['bun']`; no Node, mirroring the Docker images.
- **Install** — `bun install --frozen-lockfile` over the whole workspace, with a
  throwaway `DATABASE_URL` so the db package's `prisma generate` postinstall is
  satisfied (it never connects). `server`/`ingest` add `--linker=hoisted`: their
  bundle leaves third-party deps external, and the flat layout lets it resolve
  them at runtime. `web`/`docs` are static, so they skip it.
- **Build** — `bunx turbo build --filter=<app>`.
- **Start** — Bun apps run `dist/index.mjs` and bind the platform's `$PORT`
  (falling back to the app default). Static apps are served with `serve`
  (`-s` for the SPA fallback on `web`), fetched on first boot via `bunx`.

### Per-app notes

- **web** — set `VITE_SERVER_URL` and `VITE_DOCS_URL` as **build-time** env on
  the service before the first deploy. They are validated as URLs and baked into
  the bundle, so the build fails fast if they're missing, and changing them
  requires a rebuild.
- **docs** — the prerender boots a loopback server and crawls it during the
  build. That runs inside the single build container, so it works without the
  `--network=host` the Docker build needs. If your platform's build sandbox
  blocks loopback, deploy docs from `apps/fumadocs/Dockerfile` instead.
- **server / ingest** — set every required runtime env var from the
  [table above](#environment). On platforms that inject only `$PORT`, the start
  command maps it onto `SERVER_PORT` / `INGEST_PORT` for you.

### Data services and migrations

Nixpacks builds **apps only** — there is no bundled-infra equivalent. Provision
Postgres, Redis, Redpanda, and ClickHouse yourself (managed services or your
platform's database add-ons), apply `clickhouse/init.sql`, and create the events
topic, exactly as in Compose managed mode.

Run migrations as a one-off **before** the first `server`/`ingest` deploy and on
every upgrade. The simplest portable way is the published `migrate` image:

```bash
docker run --rm \
  -e DATABASE_URL=postgresql://… \
  -e CLICKHOUSE_URL=http://… -e CLICKHOUSE_USER=… -e CLICKHOUSE_PASSWORD=… \
  ghcr.io/noot-studio/sbox-analytics/migrate:latest \
  sh -c 'cd packages/db && bun run db:deploy'
```

Or, from a checkout with Bun installed:
`cd packages/db && bun install && bun run db:deploy`.

---

## Scaling across a fleet

`server`, `ingest`, `web`, and `docs` are stateless and scale horizontally.

- **Docker** — push the images to a registry and pull them anywhere. To run more
  than one replica per app, **remove the published `ports`** from
  `docker-compose.yaml` (a host port binds one container) and route traffic
  through your own load balancer / ingress.
- **Nixpacks** — scale replicas through the platform; it fronts them with its own
  router.

Raise event throughput by increasing `KAFKA_PARTITIONS` and adding `ingest`
replicas behind the load balancer.

## Upgrades

- **Docker Compose** — `git pull && docker compose up -d --build`. The `migrate`
  job re-applies both stores. ClickHouse `init.sql` only runs on a **fresh**
  volume; schema changes after first boot come from
  `packages/db/clickhouse/migrations/`, which `db:deploy` applies.
- **Nixpacks** — redeploy each service, and run the `migrate` one-off whenever a
  release adds migrations.

## Production checklist

- Set a strong, unique `BETTER_AUTH_SECRET` (≥32 chars) and real
  `CLICKHOUSE_PASSWORD` / `POSTGRES_PASSWORD` — the defaults are dev-only.
- Keep the data services off the public network. Never expose Postgres or
  ClickHouse directly to the internet; the bundled Compose services are
  unpublished by design.
- Put TLS termination (reverse proxy / load balancer / ingress) in front of the
  published app ports.
- Point `BETTER_AUTH_URL`, `CORS_ORIGIN`, and the web build's `VITE_*` URLs at
  your real hostnames — a mismatch breaks sign-in and dashboard API calls.
- Set `NODE_ENV=production`.
