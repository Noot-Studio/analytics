-- 002_spatial_columns.sql
-- Adds first-class spatial columns (scene + 3D position) to the events pipeline.
-- Spatial data is opt-in per event: non-spatial rows get scene='' and NULL positions.
--
-- NOTE: the Kafka-engine `events_queue` table cannot be ALTERed (ADD COLUMN is
-- unsupported) and does not allow DEFAULT expressions, so it is dropped and
-- recreated rather than altered. The MergeTree `events` table is altered in place.

-- 1. MergeTree target — ALTER in place (DEFAULT is allowed here).
ALTER TABLE analytics.events
  ADD COLUMN IF NOT EXISTS scene LowCardinality(String) DEFAULT '' AFTER properties,
  ADD COLUMN IF NOT EXISTS pos_x Nullable(Float32) AFTER scene,
  ADD COLUMN IF NOT EXISTS pos_y Nullable(Float32) AFTER pos_x,
  ADD COLUMN IF NOT EXISTS pos_z Nullable(Float32) AFTER pos_y;

-- 2. Kafka source — drop + recreate (no ALTER, no DEFAULT on Kafka engine).
DROP TABLE IF EXISTS analytics.events_queue;
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

-- 3. Materialized view — recreate to project the new spatial columns.
DROP VIEW IF EXISTS analytics.events_mv;
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
