-- Raw events table — long-term store for all ingested analytics events.
-- The event columns below mirror EVENT_COLUMNS / ClickHouseEvent in
-- packages/events/src/contract.ts (the canonical source). Keep them in sync.
CREATE TABLE IF NOT EXISTS analytics.events
(
    project_id   String,
    event_type   LowCardinality(String),
    timestamp    DateTime64(3, 'UTC'),
    session_id   String,
    player_id    String,
    properties   String,
    scene        LowCardinality(String) DEFAULT '',
    pos_x        Nullable(Float32),
    pos_y        Nullable(Float32),
    pos_z        Nullable(Float32),
    ingested_at  DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, event_type, timestamp, session_id)
TTL toDateTime(timestamp) + INTERVAL 13 MONTH;

-- Kafka source — reads JSON events from Redpanda topic `events`.
CREATE TABLE IF NOT EXISTS analytics.events_queue
(
    project_id  String,
    event_type  String,
    timestamp   DateTime64(3, 'UTC'),
    session_id  String,
    player_id   String,
    properties  String,
    scene       LowCardinality(String),
    pos_x       Nullable(Float32),
    pos_y       Nullable(Float32),
    pos_z       Nullable(Float32)
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'redpanda:9092',
    kafka_topic_list = 'events',
    kafka_group_name = 'clickhouse-events-ingest',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1,
    kafka_thread_per_consumer = 0,
    kafka_handle_error_mode = 'stream';

-- Materialized view — pipes Kafka rows into the persistent MergeTree.
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.events_mv
TO analytics.events AS
SELECT
    project_id,
    event_type,
    timestamp,
    session_id,
    player_id,
    properties,
    scene,
    pos_x,
    pos_y,
    pos_z
FROM analytics.events_queue
WHERE length(_error) = 0;

-- Daily aggregate — powers DAU and event-count dashboards without scanning raw events.
CREATE TABLE IF NOT EXISTS analytics.events_daily
(
    project_id   String,
    event_date   Date,
    event_type   LowCardinality(String),
    unique_players AggregateFunction(uniq, String),
    unique_sessions AggregateFunction(uniq, String),
    event_count    AggregateFunction(count, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (project_id, event_date, event_type);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.events_daily_mv
TO analytics.events_daily AS
SELECT
    project_id,
    toDate(timestamp) AS event_date,
    event_type,
    uniqState(player_id)  AS unique_players,
    uniqState(session_id) AS unique_sessions,
    countState()          AS event_count
FROM analytics.events
GROUP BY project_id, event_date, event_type;

-- NOTE: keep the following block in sync with clickhouse/migrations/001_phase1_views.sql
-- First-seen date per player — powers /players new-vs-returning and /retention cohorts.
CREATE TABLE IF NOT EXISTS analytics.player_first_seen
(
    project_id String,
    player_id  String,
    first_seen AggregateFunction(min, Date)
)
ENGINE = AggregatingMergeTree
ORDER BY (project_id, player_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.player_first_seen_mv
TO analytics.player_first_seen AS
SELECT
    project_id,
    player_id,
    minState(toDate(timestamp)) AS first_seen
FROM analytics.events
GROUP BY project_id, player_id;

-- Per-session start/end — powers /sessions duration, avg length, and time-of-day heatmap.
-- NOTE: sessions are keyed per event_date; a session spanning midnight yields one row per day.
CREATE TABLE IF NOT EXISTS analytics.sessions_summary
(
    project_id String,
    session_id String,
    player_id  String,
    event_date Date,
    started_at AggregateFunction(min, DateTime64(3, 'UTC')),
    ended_at   AggregateFunction(max, DateTime64(3, 'UTC'))
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (project_id, event_date, session_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.sessions_summary_mv
TO analytics.sessions_summary AS
SELECT
    project_id,
    session_id,
    player_id,
    toDate(timestamp)   AS event_date,
    minState(timestamp) AS started_at,
    maxState(timestamp) AS ended_at
FROM analytics.events
GROUP BY project_id, session_id, player_id, event_date;
