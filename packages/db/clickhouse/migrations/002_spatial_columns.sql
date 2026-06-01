-- 002_spatial_columns.sql
-- Adds first-class spatial columns (scene + 3D position) to the events pipeline.
-- Spatial data is opt-in per event: non-spatial rows get scene='' and NULL positions.

ALTER TABLE analytics.events
    ADD COLUMN IF NOT EXISTS scene LowCardinality(String) DEFAULT '',
    ADD COLUMN IF NOT EXISTS pos_x Nullable(Float32),
    ADD COLUMN IF NOT EXISTS pos_y Nullable(Float32),
    ADD COLUMN IF NOT EXISTS pos_z Nullable(Float32);

ALTER TABLE analytics.events_queue
    ADD COLUMN IF NOT EXISTS scene LowCardinality(String) DEFAULT '',
    ADD COLUMN IF NOT EXISTS pos_x Nullable(Float32),
    ADD COLUMN IF NOT EXISTS pos_y Nullable(Float32),
    ADD COLUMN IF NOT EXISTS pos_z Nullable(Float32);

-- A materialized view's SELECT is fixed at creation, so recreate it to emit the new
-- columns. Dropping the MV does NOT touch already-ingested rows in analytics.events.
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
