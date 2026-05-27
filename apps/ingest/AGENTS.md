# `apps/ingest` — Event Ingestion API (Hono / Bun)

High-throughput HTTP endpoint that accepts analytics events from game SDKs and produces them to Redpanda. ClickHouse consumes from Redpanda directly via its Kafka engine table (`packages/db/clickhouse/init.sql`) — there is no separate consumer process.

## Pipeline

```
SDK ──HTTP──> apps/ingest (Hono) ──Kafka──> Redpanda topic `events`
                                              └──> ClickHouse Kafka engine ──> MergeTree
```

## Responsibilities

- Accept `POST /v1/events`.
- Authenticate every request via `X-Api-Key` against `api_key.publishableKey` in Postgres (Prisma).
- Cache key → project resolution in Redis (5 min positive, 30 s negative).
- Validate and produce events as JSONEachRow records on the Redpanda `events` topic.

## Layout

```
src/index.ts      # Hono app, server bootstrap, graceful shutdown
src/keys.ts       # API key resolver (Prisma + Bun's Redis client)
src/producer.ts   # kafkajs producer; acks=all (durability)
src/schema.ts     # Zod schema, limits, ClickHouse row shape, timestamp formatter
```

## Run locally

1. `bun run db:start` — postgres + redis + redpanda + clickhouse via `packages/db/docker-compose.yml`.
2. `bun run dev:ingest` — Hono on `http://localhost:8080` (`INGEST_PORT`).
3. Health: `GET http://localhost:8080/healthz`.

## Event contract

```json
POST /v1/events
X-Api-Key: pk_...
Content-Type: application/json

{
  "events": [
    {
      "type": "level_complete",
      "session_id": "sess_abc",
      "player_id": "player_123",
      "timestamp": "2026-05-27T14:30:00Z",
      "properties": { "level": 5 }
    }
  ]
}
```

Returns `202 { "accepted": <count> }`. Only `type` and `session_id` are required.

## Conventions

- Hard limits (batch 500, properties 16 KiB, body 2 MiB) live as constants in `src/schema.ts`.
- The `ClickHouseEvent` type in `src/schema.ts` **is** the ClickHouse Kafka engine schema contract. Adding a column means updating `init.sql`, the `events_queue` table, and this type in lockstep.
- Acks are `-1` (all ISR) — durability over latency. Don't relax without a measurement.
- New env vars: declare in `packages/env/src/server.ts`.

## Not in scope

Auth/billing/dashboarding — those live in `apps/server` and `packages/api`. This service stays narrow: validate, publish, return 202.
