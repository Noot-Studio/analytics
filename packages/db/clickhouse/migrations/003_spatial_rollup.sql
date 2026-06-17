-- 003_spatial_rollup.sql
-- Dedicated rollup tables for pre-aggregated spatial analytics (docs/adr/0003).
-- The SDK accumulates dwell/visit cells client-side and flushes batch events,
-- which ingest fans out into per-cell rows on the `spatial_cells` topic and
-- per-point rows on the `trajectory` topic. All objects are additive — fresh
-- installs get the same shapes from init.sql.

-- Spatial heatmap rollup — sums dwell/visit cells across flush windows + players.
CREATE TABLE IF NOT EXISTS analytics.spatial_cells
(
    project_id String,
    scene      LowCardinality(String),
    kind       LowCardinality(String),
    cell_size  Float32,
    gx         Int32,
    gy         Int32,
    gz         Int32,
    day        Date,
    value      Float64,
    hits       UInt64
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(day)
ORDER BY (project_id, scene, kind, cell_size, gx, gy, gz, day);

CREATE TABLE IF NOT EXISTS analytics.spatial_cells_queue
(
    project_id String,
    scene      String,
    kind       String,
    cell_size  Float32,
    gx         Int32,
    gy         Int32,
    gz         Int32,
    day        Date,
    value      Float64,
    hits       UInt64
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'redpanda:9092',
    kafka_topic_list = 'spatial_cells',
    kafka_group_name = 'clickhouse-spatial-cells-ingest',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1,
    kafka_thread_per_consumer = 0,
    kafka_handle_error_mode = 'stream';

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.spatial_cells_mv
TO analytics.spatial_cells AS
SELECT
    project_id,
    scene,
    kind,
    cell_size,
    gx,
    gy,
    gz,
    day,
    value,
    hits
FROM analytics.spatial_cells_queue
WHERE length(_error) = 0;

-- Per-player trajectories — RDP-simplified ordered paths, one row per kept point.
CREATE TABLE IF NOT EXISTS analytics.trajectory_points
(
    project_id  String,
    scene       LowCardinality(String),
    player_id   String,
    session_id  String,
    seq         UInt32,
    pos_x       Float32,
    pos_y       Float32,
    pos_z       Float32,
    timestamp   DateTime64(3, 'UTC'),
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, scene, player_id, session_id, timestamp, seq)
TTL toDateTime(timestamp) + INTERVAL 13 MONTH;

CREATE TABLE IF NOT EXISTS analytics.trajectory_queue
(
    project_id String,
    scene      String,
    player_id  String,
    session_id String,
    seq        UInt32,
    pos_x      Float32,
    pos_y      Float32,
    pos_z      Float32,
    timestamp  DateTime64(3, 'UTC')
)
ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'redpanda:9092',
    kafka_topic_list = 'trajectory',
    kafka_group_name = 'clickhouse-trajectory-ingest',
    kafka_format = 'JSONEachRow',
    kafka_num_consumers = 1,
    kafka_thread_per_consumer = 0,
    kafka_handle_error_mode = 'stream';

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.trajectory_points_mv
TO analytics.trajectory_points AS
SELECT
    project_id,
    scene,
    player_id,
    session_id,
    seq,
    pos_x,
    pos_y,
    pos_z,
    timestamp
FROM analytics.trajectory_queue
WHERE length(_error) = 0;
