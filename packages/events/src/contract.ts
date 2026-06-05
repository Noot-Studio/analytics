// The Event contract shared by the ingestion path (apps/ingest) and the query
// path (packages/api). This module is the single machine-checkable agreement on
// the `analytics.events` row shape, its real columns, and the canonical event
// names — keep it in lockstep with clickhouse/init.sql.

/**
 * `analytics.events` row shape, as produced to the Redpanda `events` topic
 * (JSONEachRow) and consumed by the ClickHouse Kafka engine. Adding a column
 * means updating `init.sql`, the `events_queue` table, and this type together.
 */
export interface ClickHouseEvent {
  project_id: string;
  event_type: string;
  timestamp: string;
  session_id: string;
  player_id: string;
  properties: string;
  scene: string;
  pos_x: number | null;
  pos_y: number | null;
  pos_z: number | null;
}

/**
 * Real top-level columns on `analytics.events`. Filters targeting these
 * reference the column directly; everything else is read out of the JSON
 * `properties` blob via JSONExtract. The set doubles as an allowlist — only
 * these exact identifiers are ever interpolated as raw SQL column names.
 */
export const EVENT_COLUMNS = [
  "project_id",
  "event_type",
  "timestamp",
  "session_id",
  "player_id",
  "scene",
  "pos_x",
  "pos_y",
  "pos_z",
] as const;

export type EventColumn = (typeof EVENT_COLUMNS)[number];

/**
 * Canonical core event names the dashboard understands. The ingestion API does
 * not restrict `type` to this set — games may send arbitrary/custom event
 * names — but these are the names the analytics routes query by.
 */
export const CORE_EVENT_TYPES = [
  "session_start",
  "session_end",
  "player_death",
  "level_complete",
  "custom_event",
] as const;

export type CoreEventType = (typeof CORE_EVENT_TYPES)[number];

/**
 * Canonical performance event names. Like {@link CORE_EVENT_TYPES}, these are
 * not enforced at ingestion; they name the events the performance routes read.
 */
export const PERFORMANCE_EVENT_TYPES = [
  "fps_sample",
  "crash",
  "load_complete",
] as const;

export type PerformanceEventType = (typeof PERFORMANCE_EVENT_TYPES)[number];
