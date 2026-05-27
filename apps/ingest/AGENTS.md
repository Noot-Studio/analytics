# `apps/ingest` — Event Ingestion API (Go)

High-throughput HTTP endpoint that accepts analytics events from the C# SDK and produces them to Redpanda. Sized to handle bursty player traffic without backpressuring the dashboard backend.

## Responsibilities

- Accept `POST /v1/events` (contract in `docs/agents/features.md`).
- Authenticate every request via `X-Api-Key` against `api_key.publishableKey` in Postgres.
- Cache key→project resolution in Redis (5 min positive, 30 s negative).
- Produce validated events as JSONEachRow records to the Redpanda `events` topic, which a ClickHouse `Kafka` engine table consumes.

## Layout

```
cmd/server/main.go            # Wires pgx, redis, kafka, echo; loads .env via godotenv
internal/config/               # Env-driven config struct
internal/keys/                 # API key resolver (Postgres + Redis)
internal/producer/             # franz-go client, Event struct = ClickHouse Kafka schema
internal/handler/events.go     # POST /v1/events validation + publish
Dockerfile                     # distroless static binary
```

## Run locally

1. `bun run db:start` (postgres + redis + redpanda + clickhouse via `packages/db/docker-compose.yml`).
2. `bun run dev:ingest` — `go run ./cmd/server` with `.env` auto-loaded.
3. Health: `GET http://localhost:8080/healthz`.

## Conventions

- All hard limits (batch size 500, properties 16 KiB, body 2 MiB) live as constants in `internal/handler/events.go` — tune them there.
- The `producer.Event` struct **is** the ClickHouse schema contract. Adding a column means updating `init.sql`, the `events_queue` Kafka engine table, and this struct in lockstep.
- New env vars: declare in `internal/config/config.go` only; the Go service does not share TypeScript's `@sbox-analytics/env` schema.
- Acks are `AllISRAcks()` — durability over latency. Don't relax without a measurement.

## Not in scope

Auth/billing/dashboarding — those live in `apps/server` and `packages/api`. This service stays narrow: validate, publish, return 202.
