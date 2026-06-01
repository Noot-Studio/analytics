import { z } from "zod";

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

// ClickHouse `events_queue` row shape (JSONEachRow).
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

const TS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  fractionalSecondDigits: 3,
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
  year: "numeric",
});

// ClickHouse DateTime64(3, 'UTC') wants `YYYY-MM-DD HH:MM:SS.sss`.
export const formatTimestamp = (date: Date): string => {
  const parts = TS_FORMATTER.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      lookup[p.type] = p.value;
    }
  }
  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second}.${lookup.fractionalSecond}`;
};

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
