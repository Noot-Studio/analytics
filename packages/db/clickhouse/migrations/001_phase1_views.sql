-- Phase 1 analytics views. Keep in sync with the matching block in clickhouse/init.sql.
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
