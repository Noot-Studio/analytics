// Thin re-export over the canonical Event contract in @sbox-analytics/events,
// which owns the incoming schema and the incoming-event -> ClickHouse row
// mapping. Only the transport limits below are ingest-local concerns.
import type { ClickHouseEvent } from "@sbox-analytics/events";

export type { ClickHouseEvent };
export {
  batchSchema,
  type IncomingBatch,
  type IncomingEvent,
  MAX_BATCH_SIZE,
  toClickHouseEvent,
} from "@sbox-analytics/events";

export const MAX_PROPERTIES_BYTES = 16 * 1024;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
