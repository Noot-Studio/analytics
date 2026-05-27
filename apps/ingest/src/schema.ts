import { z } from "zod";

export const MAX_BATCH_SIZE = 500;
export const MAX_PROPERTIES_BYTES = 16 * 1024;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

const eventSchema = z.object({
  player_id: z.string().max(128).optional().default(""),
  properties: z.record(z.string(), z.unknown()).optional(),
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
export function formatTimestamp(date: Date): string {
  const parts = TS_FORMATTER.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      lookup[p.type] = p.value;
    }
  }
  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second}.${lookup.fractionalSecond}`;
}
