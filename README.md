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
the repo root, and each app also carries a `nixpacks.toml` for platform-native
deploys (Dokploy / Railway / Coolify). Images and processes are stateless and
12-factor (all config via env), so they run on plain Docker, Swarm, Nomad,
Kubernetes, or any Nixpacks PaaS.

| Image    | Built from      | Runtime | Container port |
| -------- | --------------- | ------- | -------------- |
| `server` | `apps/server`   | Bun     | 3000           |
| `ingest` | `apps/ingest`   | Bun     | 8080           |
| `web`    | `apps/web`      | nginx   | 80             |
| `docs`   | `apps/fumadocs` | nginx   | 80             |

Quick start — create a `.env` next to `docker-compose.yaml` with your secrets and
`COMPOSE_PROFILES=infra` (bundles Postgres/Redis/Redpanda/ClickHouse), then:

```bash
docker compose -f docker-compose.yaml -f docker-compose.expose.yml up -d --build
```

The base compose publishes no host ports — behind a reverse proxy the apps are
reached over the Docker network. The `expose` overlay publishes them for direct
access: dashboard → `http://localhost:3001`, API → `:3000`, ingest → `:8080`,
docs → `:3002`. A one-shot `migrate` job applies the Postgres and ClickHouse
schemas before `server` and `ingest` start.

**Full guide** — whole monorepo or individual apps, Docker **or** Nixpacks, the
complete environment reference, migrations, scaling, and the production checklist:
**[docs/deployment.md](./docs/deployment.md)**.

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
