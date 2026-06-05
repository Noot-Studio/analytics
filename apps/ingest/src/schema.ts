import type { ClickHouseEvent } from "@sbox-analytics/events";
import { formatTimestamp } from "@sbox-analytics/events";
import { z } from "zod";

export type { ClickHouseEvent };

export const MAX_BATCH_SIZE = 500;
export const MAX_PROPERTIES_BYTES = 16 * 1024;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const eventSchema = z.object({
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
