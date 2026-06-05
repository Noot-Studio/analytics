import { describe, expect, it } from "bun:test";

import { formatTimestamp, toClickHouseDateTime } from "./timestamps";

describe("formatTimestamp (Date -> insert row)", () => {
  it("formats a UTC instant as YYYY-MM-DD HH:MM:SS.sss", () => {
    expect(formatTimestamp(new Date("2026-05-27T14:30:00.000Z"))).toBe(
      "2026-05-27 14:30:00.000"
    );
  });

  it("preserves fractional milliseconds", () => {
    expect(formatTimestamp(new Date("2026-05-27T14:30:00.123Z"))).toBe(
      "2026-05-27 14:30:00.123"
    );
  });

  it("normalizes an offset timezone to UTC", () => {
    // 14:30 at +02:00 is 12:30 UTC.
    expect(formatTimestamp(new Date("2026-05-27T14:30:00+02:00"))).toBe(
      "2026-05-27 12:30:00.000"
    );
  });

  it("zero-pads single-digit month/day/time components", () => {
    expect(formatTimestamp(new Date("2026-01-02T03:04:05.006Z"))).toBe(
      "2026-01-02 03:04:05.006"
    );
  });
});

describe("toClickHouseDateTime (ISO string -> query param)", () => {
  it("replaces the T separator and drops the trailing Z", () => {
    expect(toClickHouseDateTime("2026-05-27T14:30:00Z")).toBe(
      "2026-05-27 14:30:00"
    );
  });

  it("keeps fractional seconds while normalizing T and Z", () => {
    expect(toClickHouseDateTime("2026-05-27T14:30:00.123Z")).toBe(
      "2026-05-27 14:30:00.123"
    );
  });

  it("leaves an already-formatted string untouched", () => {
    expect(toClickHouseDateTime("2026-05-27 14:30:00.123")).toBe(
      "2026-05-27 14:30:00.123"
    );
  });

  it("replaces T even without a Z suffix", () => {
    expect(toClickHouseDateTime("2026-05-27T14:30:00")).toBe(
      "2026-05-27 14:30:00"
    );
  });

  it("does not strip a non-Z offset (out of contract, documents behavior)", () => {
    expect(toClickHouseDateTime("2026-05-27T14:30:00+02:00")).toBe(
      "2026-05-27 14:30:00+02:00"
    );
  });
});
