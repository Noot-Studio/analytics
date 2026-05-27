# Development Reference

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          OVH VPS (8 vCores, 24GB)                       │
│                              Debian + Dokploy                           │
│                                                                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│  │  s&box Game │────▶│  SDK (C#)   │────▶│  Ingest API │               │
│  │  (Client)   │     │  (NuGet)    │     │   (Go)      │               │
│  └─────────────┘     └─────────────┘     └──────┬──────┘               │
│                                                 │                       │
│                                ┌────────────────┼────────────────┐     │
│                                ▼                ▼                ▼     │
│                          ┌─────────┐      ┌─────────┐      ┌──────────┐│
│                          │ Kafka/  │      │ Redis   │      │ Postgres ││
│                          │Redpanda │      │ (Cache) │      │ (Users)  ││
│                          └────┬────┘      └─────────┘      └──────────┘│
│                               │                                       │
│                               ▼                                       │
│                          ┌─────────┐                                  │
│                          │ClickHouse│ ◄── Analytics DB                │
│                          └────┬────┘                                  │
│                               │                                       │
│                               ▼                                       │
│                          ┌─────────────┐                              │
│                          │  Dashboard  │                              │
│                          │ (React +    │                              │
│                          │ TanStack    │                              │
│                          │ Router +    │                              │
│                          │ shadcn/ui)  │                              │
│                          └──────┬──────┘                              │
│                                 │                                     │
│                                 ▼                                     │
│                          ┌─────────────┐                              │
│                          │ Hono + oRPC │                              │
│                          │ API Backend │                              │
│                          │(Better Auth,│                              │
│                          │Drizzle,Polar)│                             │
│                          └─────────────┘                              │
└─────────────────────────────────────────────────────────────────────────┘
```

## Trade-offs

- **ClickHouse over Postgres for analytics**: We give up transactional guarantees and complex joins for 100x faster aggregations on time-series event data. Reversible: can dual-write during migration.
- **Kafka over direct DB writes**: Adds operational complexity but provides backpressure handling, replay capability, and decouples ingestion from analytics. Reversible: can write direct-to-DB for small scale.
- **Go for ingestion API over Node/Bun**: Slightly slower iteration speed, but better memory efficiency and concurrency for high-throughput event ingestion. Reversible: can consolidate into the oRPC backend if volume stays low.
- **Hono + oRPC + TanStack Router for web platform**: Standardizes on a modern React app with TanStack Router for routing, Hono for the HTTP/API layer, oRPC for end-to-end type safety, Better Auth for authentication, Drizzle for database access, and Polar for billing. We give up some framework-level conventions from Next.js in exchange for a lighter, explicit client/server architecture.
- **Self-hosted OVH VPS over managed cloud**: We take on operational burden (backups, updates, monitoring) in exchange for ~80% cost savings. Reversible: migrate to managed services when revenue justifies it.

## Tech Stack

| Layer             | Choice                                                              | Rationale                                                                                                                   |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Platform Scaffold | [better-t-stack](https://github.com/michaelangeloio/better-t-stack) | Monorepo configured for Hono + oRPC + TanStack Router + React + Better Auth + Drizzle + Polar — rapid, type-safe foundation |
| Dashboard         | React + TanStack Router + Tailwind + shadcn/ui + Recharts           | Type-safe client routing, accessible components, and Recharts for analytics visualizations                                  |
| Web Backend       | Hono + oRPC + Better Auth + Drizzle ORM + Polar.sh                  | Lightweight HTTP server, end-to-end type safety, built-in auth, payment-ready                                               |
| Runtime           | Bun                                                                 | Fast JS/TS runtime, compatible with Hono, oRPC, and the better-t-stack scaffold                                             |
| Package Manager   | Bun                                                                 | Consistent with runtime, fast installs                                                                                      |
| Ingestion API     | Go (Echo/Fiber)                                                     | High throughput, low latency, small binary                                                                                  |
| Analytics DB      | ClickHouse (self-hosted on VPS)                                     | Purpose-built for time-series aggregations; self-hosted to keep costs minimal                                               |
| Metadata DB       | PostgreSQL 16 (self-hosted on VPS)                                  | Users, orgs, projects, billing — transactional needs, managed by Drizzle                                                    |
| Queue             | Kafka (self-hosted on VPS or Redpanda)                              | Event streaming; Redpanda is a lighter Kafka-compatible alternative for single-node                                         |
| Cache             | Redis (self-hosted on VPS)                                          | Session caching, rate limiting, real-time counters                                                                          |
| Hosting           | OVH VPS (8 vCores, 24GB RAM) + Dokploy                              | Existing infrastructure, ~€25/month; Dokploy provides Heroku-like DX for Docker deploys                                     |
| SDK               | C# .NET Standard 2.1                                                | s&box runs on .NET, package via NuGet                                                                                       |
| Monitoring        | Datadog or Grafana Cloud                                            | Observability-first principle                                                                                               |
| Documentation     | MDX docs inside the TanStack Router React app                       | API reference, SDK guides, and tutorials kept in the same web platform                                                      |
| Linting           | Oxlint + Ultracite                                                  | Fast linting, consistent code quality                                                                                       |
| Monorepo          | Turborepo (via better-t-stack addon)                                | Efficient task orchestration across packages                                                                                |

## Risks & Mitigations

| Risk                                     | Likelihood | Impact   | Mitigation                                                                                                           |
| ---------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| ClickHouse operational complexity        | Medium     | High     | Self-hosted with Docker; maintain automated backups and monitoring alerts; migrate to ClickHouse Cloud when >$5K MRR |
| s&box ecosystem too small                | Medium     | Critical | Build generic game analytics layer; can pivot to Unity/Godot later                                                   |
| Event volume spikes (DDoS or viral game) | Medium     | High     | Rate limiting per API key, Kafka backpressure, auto-scaling ingestion                                                |
| SDK adoption friction                    | High       | Medium   | Extensive docs (Fumadocs), video tutorials, s&box community Discord presence                                         |
| Data privacy compliance (GDPR)           | Low        | High     | No PII collection, EU data residency option, privacy policy from day one                                             |
