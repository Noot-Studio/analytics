# s&box Game Analytics Web Platform — Execution Plan

## 1. Product Vision

### Core Purpose

A analytics platform purpose-built for s&box game developers, providing real-time player behavior insights, session tracking, and performance monitoring without the bloat of general-purpose analytics tools.

### Target Users

- **Primary**: Indie s&box game developers and small studios (1-10 people)
- **Secondary**: Mod creators and community content builders
- **Tertiary**: Mid-size studios scaling s&box titles

### Value Proposition

- **Game-native**: Pre-built events for player death, item pickup, session start/end, level completion — no custom instrumentation needed for common game events
- **s&box-native SDK**: Drop-in C# library with automatic s&box lifecycle hooks
- **Privacy-first**: No PII collection, GDPR-compliant by design, data residency options
- **Performance-conscious**: Async batching, minimal overhead (<1ms per event)
- **Community pricing**: Free tier for hobbyists, transparent pricing for commercial use

### Differentiation from General Analytics

| Dimension    | Google Analytics | Our Platform                                                  |
| ------------ | ---------------- | ------------------------------------------------------------- |
| Event model  | Pageviews/clicks | Game sessions, player states, in-world events                 |
| Real-time    | ~24h delay       | <5s latency                                                   |
| Game metrics | None built-in    | DAU/MAU, retention curves, session length, player progression |
| SDK          | JavaScript       | C# native for s&box                                           |
| Privacy      | Complex opt-out  | Privacy by default                                            |

## 2. Product Features

### Phase 1: MVP (Months 1-3)

- **Authentication**: Email/password + OAuth (Discord, Steam — s&box developers already use these) via Better Auth
- **Organizations**: Multi-user orgs with role-based access (Owner, Admin, Viewer)
- **Projects**: Create/configure projects, get API key pair (publishable + secret)
- **Event Ingestion API**: HTTP POST `/v1/events` with batch support
- **Core Events**: session_start, session_end, player_death, level_complete, custom_event
- **Dashboard**: Real-time event stream, DAU/WAU/MAU, session count, average session duration
- **SDK**: NuGet package `Noot.Analytics.Sdk` with automatic s&box integration

### Phase 2: Growth (Months 4-6)

- **Retention Analytics**: Cohort-based Day-1/7/30 retention curves
- **Funnel Analysis**: Visual funnel builder for player progression
- **Player Profiles**: Anonymous player journey (not PII-linked)
- **Performance Events**: FPS drops, load times, crash reporting
- **Alerts**: Webhook/email alerts for anomaly detection (spike in errors, drop in DAU)
- **Team Management**: Invite links, granular permissions

### Phase 3: Scale (Months 7-9)

- **Raw Data Export**: Parquet/CSV export to S3
- **Custom Dashboards**: User-built dashboards with drag-drop widgets
- **A/B Testing Framework**: Built-in experiment assignment and significance testing
- **Billing & Usage**: Polar.sh integration, usage-based pricing, invoices
- **SLA**: 99.9% uptime guarantee, dedicated support for paid tiers

### API Design (v1)

```
POST /v1/events
Headers: X-Api-Key: {publishable_key}
Body: {
  "events": [
    {
      "type": "session_start",
      "timestamp": "2026-05-06T12:00:00Z",
      "session_id": "uuid",
      "player_id": "anon_hash",
      "properties": { "map": "de_dust2", "game_mode": "competitive" }
    }
  ]
}
```

## 3. Development Plan

### Architecture

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

**Trade-offs made:**

- **ClickHouse over Postgres for analytics**: We give up transactional guarantees and complex joins for 100x faster aggregations on time-series event data. Reversible: can dual-write during migration.
- **Kafka over direct DB writes**: Adds operational complexity but provides backpressure handling, replay capability, and decouples ingestion from analytics. Reversible: can write direct-to-DB for small scale.
- **Go for ingestion API over Node/Bun**: Slightly slower iteration speed, but better memory efficiency and concurrency for high-throughput event ingestion. Reversible: can consolidate into the oRPC backend if volume stays low.
- **Hono + oRPC + TanStack Router for web platform**: Standardizes on a modern React app with TanStack Router for routing, Hono for the HTTP/API layer, oRPC for end-to-end type safety, Better Auth for authentication, Drizzle for database access, and Polar for billing. We give up some framework-level conventions from Next.js in exchange for a lighter, explicit client/server architecture.
- **Self-hosted OVH VPS over managed cloud**: We take on operational burden (backups, updates, monitoring) in exchange for ~80% cost savings. Reversible: migrate to managed services when revenue justifies it.

### Tech Stack

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

### Milestones

#### Month 1: Foundation

- **Week 1-2**: Generate the Hono + oRPC + TanStack Router React scaffold with better-t-stack, set up monorepo, CI/CD pipeline; provision OVH VPS with Dokploy, Docker Compose for Postgres + Redis + ClickHouse + Redpanda
- **Week 3-4**: Auth service (Better Auth), user/org/project models (Drizzle + Postgres), API key generation; deploy to Dokploy staging
- **Deliverable**: Local dev environment + Dokploy staging, authenticated API calls working

#### Month 2: Ingestion & Storage

- **Week 1-2**: Event ingestion API with validation, Kafka producer/consumer
- **Week 3-4**: ClickHouse schema design, event aggregation pipelines, basic SDK
- **Deliverable**: Events flowing end-to-end, SDK published to private NuGet feed

#### Month 3: Dashboard MVP

- **Week 1-2**: React dashboard scaffold with TanStack Router, shadcn/ui, and real-time metrics widgets using Recharts
- **Week 3-4**: Session analytics, DAU/WAU/MAU views, public docs via Fumadocs
- **Deliverable**: Closed beta with 3-5 friendly s&box developers

#### Month 4: Retention & Funnels

- **Week 1-2**: Cohort retention calculation, funnel SQL queries
- **Week 3-4**: Frontend visualizations, player journey mapping
- **Deliverable**: Open beta signup page, 20 beta users

#### Month 5: Polish & Performance

- **Week 1-2**: Performance optimization, load testing (target: 10K events/sec)
- **Week 3-4**: Alerting, error tracking, onboarding flow
- **Deliverable**: Production-ready, Polar billing integration started

#### Month 6: Launch

- **Week 1-2**: Public launch, Hacker News / s&box forums / Reddit announcement
- **Week 3-4**: Support queue, bug fixes, first paid conversions
- **Deliverable**: Public product, pricing page, first revenue

### Risks & Mitigations

| Risk                                     | Likelihood | Impact   | Mitigation                                                                                                           |
| ---------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| ClickHouse operational complexity        | Medium     | High     | Self-hosted with Docker; maintain automated backups and monitoring alerts; migrate to ClickHouse Cloud when >$5K MRR |
| s&box ecosystem too small                | Medium     | Critical | Build generic game analytics layer; can pivot to Unity/Godot later                                                   |
| Event volume spikes (DDoS or viral game) | Medium     | High     | Rate limiting per API key, Kafka backpressure, auto-scaling ingestion                                                |
| SDK adoption friction                    | High       | Medium   | Extensive docs (Fumadocs), video tutorials, s&box community Discord presence                                         |
| Data privacy compliance (GDPR)           | Low        | High     | No PII collection, EU data residency option, privacy policy from day one                                             |

## 4. Marketing Plan

### Channels

1. **s&box Discord & Forums**: Primary community, direct developer engagement
2. **Reddit**: r/sandbox, r/gamedev, r/indiegamedev
3. **YouTube**: Tutorial videos, "Analytics for s&box" series
4. **Hacker News**: Launch post, Show HN
5. **Content SEO**: "s&box analytics", "game analytics for Source 2" blog posts

### Launch Strategy

- **Private Beta (Month 3)**: Invite 5 s&box developers personally, get feedback
- **Public Beta (Month 4)**: Open signup, no credit card required, generous free tier
- **Public Launch (Month 6)**: Coordinated announcement across all channels, limited-time Pro discount

### Positioning

"Analytics built for s&box developers — not marketers." Emphasize game-native events, privacy, and performance.

## 5. Budget & Monetization

### Pricing Tiers

| Tier           | Price     | Limits                                                            |
| -------------- | --------- | ----------------------------------------------------------------- |
| **Hobby**      | Free      | 1 project, 10K events/month, 7-day data retention                 |
| **Indie**      | $29/month | 3 projects, 1M events/month, 90-day retention, email support      |
| **Studio**     | $99/month | 10 projects, 10M events/month, 1-year retention, priority support |
| **Enterprise** | Custom    | Unlimited, custom retention, SLA, dedicated support               |

### Estimated Costs (Month 1-6)

| Item                                 | Monthly Cost          |
| ------------------------------------ | --------------------- |
| OVH VPS (8 vCores, 24GB RAM)         | ~€25 (~$27)           |
| Domain + SSL (Cloudflare)            | $0 → $20              |
| Polar.sh (payments)                  | $0 → $25              |
| Monitoring (Grafana Cloud free tier) | $0                    |
| Backup storage (S3/Backblaze)        | $0 → $10              |
| **Total**                            | **~$27 → ~$82/month** |

**Notes:**

- All services (Postgres, ClickHouse, Redis, Kafka/Redpanda) self-hosted on the VPS via Docker/Dokploy
- Grafana Cloud free tier covers 3 users, 10K metrics — sufficient for early stage
- Backup strategy: daily PostgreSQL + ClickHouse dumps to S3/Backblaze B2
- Scaling trigger: when VPS CPU/memory sustained >70%, evaluate managed ClickHouse/Kafka or second VPS

### Revenue Targets

- Month 3: 0 (beta)
- Month 4: 0 (public beta)
- Month 5: $500 MRR
- Month 6: $2,000 MRR
- Month 12: $10,000 MRR

## 6. Team Structure

| Role                  | Phase   | Notes                                                                         |
| --------------------- | ------- | ----------------------------------------------------------------------------- |
| **CTO (You)**         | All     | Architecture, planning, hiring, quality                                       |
| **Backend Engineer**  | Month 1 | Go/ClickHouse, API design, data pipelines                                     |
| **Frontend Engineer** | Month 1 | React + TanStack Router + shadcn/ui + Recharts, dashboard, data visualization |
| **SDK Engineer**      | Month 2 | C#, s&box integration, developer experience                                   |
| **DevOps Engineer**   | Month 3 | Infrastructure, monitoring, security                                          |
| **QA Engineer**       | Month 4 | Automated testing, load testing, browser validation                           |
| **Technical Writer**  | Month 3 | Docs (Fumadocs), tutorials, API reference                                     |

## 7. Success Metrics (OKRs)

### Q1 (Months 1-3)

- **Objective**: Ship closed beta
- KR1: SDK installed in 5 s&box games
- KR2: Ingestion API handles 1K events/sec in load test
- KR3: Dashboard renders core metrics in <2s

### Q2 (Months 4-6)

- **Objective**: Public launch with product-market fit signals
- KR1: 50 active projects (sending events in last 7 days)
- KR2: $2,000 MRR
- KR3: NPS score >40 from beta users

### Q3 (Months 7-9)

- **Objective**: Scale to default choice for s&box analytics
- KR1: 200 active projects
- KR2: $10,000 MRR
- KR3: <0.1% ingestion API error rate

## 8. Next Steps

1. **Approve this plan** → CEO review and sign-off
2. **Generate Hono + oRPC + TanStack Router scaffold** → Run better-t-stack CLI, commit to repo
3. **Hire Backend Engineer** → Create job description, source candidates
4. **Set up dev infrastructure** → Dokploy on OVH VPS, Docker Compose for Postgres + Redis + ClickHouse + Redpanda
5. **Create child issues** for:
   - Generate Hono + oRPC + TanStack Router monorepo
   - Provision OVH VPS with Dokploy and Docker Compose stack
   - Auth service implementation (Better Auth + Drizzle)
   - Event ingestion API
   - ClickHouse schema design
   - SDK scaffolding
   - Dashboard MVP (TanStack Router + shadcn/ui + Recharts)
