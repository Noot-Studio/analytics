// The incoming half of the Event contract: the shape games POST to the
// ingestion API (`eventSchema`/`batchSchema`) and the mapping that turns a
// validated incoming event into a `ClickHouseEvent` row. Lives here so the
// events package owns the full contract end to end — incoming shape -> row —
// and the SDK has a canonical exported schema to validate against.

import { z } from "zod";

import type { ClickHouseEvent } from "./contract";
import { formatTimestamp } from "./timestamps";

export const MAX_BATCH_SIZE = 500;

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const eventSchema = z.object({
  player_id: z.string().max(128).optional().default(""),
  position: positionSchema.optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  scene: z.string().max(128).optional().default(""),
  session_id: z.string().min(1).max(128),
  timestamp: z.coerce.date().optional(),
  type: z.string().min(1).max(128),
});

export const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(MAX_BATCH_SIZE),
});

export type IncomingEvent = z.infer<typeof eventSchema>;
export type IncomingBatch = z.infer<typeof batchSchema>;

export const toClickHouseEvent = (
  event: IncomingEvent,
  projectId: string,
  properties = "{}"
): ClickHouseEvent => ({
  event_type: event.type,
  player_id: event.player_id,
  pos_x: event.position?.x ?? null,
  pos_y: event.position?.y ?? null,
  pos_z: event.position?.z ?? null,
  project_id: projectId,
  properties,
  scene: event.scene,
  session_id: event.session_id,
  timestamp: formatTimestamp(event.timestamp ?? new Date()),
});
