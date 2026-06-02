import {
  filterOperator,
  filterSchema,
} from "@sbox-analytics/api/query-builder";
import { z } from "zod";

/**
 * Shared filtering contract for every analytics table and chart.
 *
 * The same `filterSchema` the ClickHouse query-builder consumes on the server is
 * reused verbatim here so a filter serialized into the URL deserializes straight
 * into an endpoint input — no mapping layer, no drift.
 */

export { filterOperator, filterSchema };
export type AnalyticsFilter = z.infer<typeof filterSchema>;
export type FilterOperator = z.infer<typeof filterOperator>;

/** Time-range presets offered by the shared dropdown, in ascending duration. */
export const TIME_PRESETS = ["1h", "24h", "7d", "30d", "90d"] as const;
export type TimePreset = (typeof TIME_PRESETS)[number];
export type TimeRange = TimePreset | "custom";

export const DEFAULT_RANGE: TimeRange = "30d";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Quantize "now" to the start of the current minute. A route loader and the
 * component it warms call `resolveRange` a few milliseconds apart; snapping makes
 * both return identical bounds, so they produce the same query key and the
 * component reads the loader-warmed cache entry instead of refetching (no flash).
 */
const RESOLVE_STEP_MS = 60 * 1000;

const PRESET_MS: Record<TimePreset, number> = {
  "1h": HOUR_MS,
  "24h": DAY_MS,
  "30d": 30 * DAY_MS,
  "7d": 7 * DAY_MS,
  "90d": 90 * DAY_MS,
};

export const TIME_PRESET_LABELS: Record<TimePreset, string> = {
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "30d": "Last 30 days",
  "7d": "Last 7 days",
  "90d": "Last 90 days",
};

/**
 * Canonical search-param schema. Every analytics route reuses this for
 * `validateSearch`, so filters + range survive refresh and are shareable.
 */
export const analyticsSearchSchema = z.looseObject({
  filters: z.array(filterSchema).max(10).optional(),
  // Only meaningful when range === "custom"; ISO datetime strings.
  from: z.iso.datetime().optional(),
  range: z.enum([...TIME_PRESETS, "custom"]).default(DEFAULT_RANGE),
  to: z.iso.datetime().optional(),
});
export type AnalyticsSearch = z.infer<typeof analyticsSearchSchema>;

/** Resolve a range selection into concrete ISO datetime bounds. */
export const resolveRange = (search: {
  range?: TimeRange;
  from?: string;
  to?: string;
}): { from: string; to: string } => {
  if (search.range === "custom" && search.from && search.to) {
    return { from: search.from, to: search.to };
  }
  const now = Math.floor(Date.now() / RESOLVE_STEP_MS) * RESOLVE_STEP_MS;
  const span =
    PRESET_MS[(search.range as TimePreset) ?? DEFAULT_RANGE] ??
    PRESET_MS[DEFAULT_RANGE];
  return {
    from: new Date(now - span).toISOString(),
    to: new Date(now).toISOString(),
  };
};

export type Granularity = "hour" | "day" | "week";

/** Sensible chart bucket size for a resolved range. */
export const pickGranularity = (
  fromIso: string,
  toIso: string
): Granularity => {
  const hours = (Date.parse(toIso) - Date.parse(fromIso)) / HOUR_MS;
  if (hours <= 48) {
    return "hour";
  }
  if (hours <= 60 * 24) {
    return "day";
  }
  return "week";
};
