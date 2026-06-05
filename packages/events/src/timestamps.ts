// Timestamp helpers for the two directions the Event contract crosses
// ClickHouse: formatting a Date into an insert row (ingestion), and normalizing
// an ISO query bound into a DateTime64 param (queries). They take different
// inputs (Date vs. ISO string) and are NOT interchangeable.

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

/**
 * Insert-row direction (apps/ingest). Formats a Date as the
 * `YYYY-MM-DD HH:MM:SS.sss` UTC literal ClickHouse DateTime64(3, 'UTC') expects
 * when producing rows to the `events` topic.
 */
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

/**
 * Query-param direction (packages/api query-builder). ClickHouse can't parse an
 * ISO `Z` suffix as DateTime64(3); it expects `YYYY-MM-DD HH:MM:SS[.mmm]` (UTC
 * is the column timezone already). Replaces the `T` separator and trailing `Z`.
 */
export const toClickHouseDateTime = (iso: string): string =>
  iso.replace("T", " ").replace("Z", "");
