-- Raw events table — long-term store for all ingested analytics events.
CREATE TABLE IF NOT EXISTS analytics.events
(
    project_id   String,
    event_type   LowCardinality(String),
    timestamp    DateTime64(3, 'UTC'),
    session_id   String,
    player_id    String,
    properties   String,
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
    properties  String
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
    properties
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
