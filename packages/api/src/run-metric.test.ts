import { describe, expect, it } from "bun:test";

import { createFakeChClient } from "./ch-client.fake";
import { buildQuery } from "./query-builder";
import type { QueryConfig } from "./query-builder";
import { runMetric } from "./run-metric";

const scope = {
  projectId: "proj_1",
  timeRange: { from: "2026-01-01T00:00:00Z", to: "2026-01-08T00:00:00Z" },
};

const scalarConfig: QueryConfig = {
  aggregation: "count",
  granularity: "none",
  limit: 100,
  ...scope,
};

const seriesConfig: QueryConfig = {
  aggregation: "count",
  granularity: "day",
  limit: 100,
  ...scope,
};

describe("runMetric", () => {
  it("builds the merged config and runs the resulting query", async () => {
    const built = buildQuery(scalarConfig);
    const ch = createFakeChClient([
      { query: built.query, rows: [{ value: "42" }] },
    ]);

    const result = await runMetric(ch, scalarConfig);

    // It forwarded exactly what the builder produced across the seam.
    expect(ch.calls).toEqual([{ params: built.params, sql: built.query }]);
    expect(result.sql).toBe(built.query);
  });

  it("validates scalar rows against the value-only shape, coercing value", async () => {
    const built = buildQuery(scalarConfig);
    const ch = createFakeChClient([
      { query: built.query, rows: [{ value: "42" }] },
    ]);

    const { rows } = await runMetric(ch, scalarConfig);

    expect(rows).toEqual([{ value: 42 }]);
  });

  it("validates series rows against the time-bucket shape", async () => {
    const built = buildQuery(seriesConfig);
    const ch = createFakeChClient([
      {
        query: built.query,
        rows: [{ time_bucket: "2026-01-01 00:00:00", value: "7" }],
      },
    ]);

    const { rows } = await runMetric(ch, seriesConfig);

    expect(rows).toEqual([{ time_bucket: "2026-01-01 00:00:00", value: 7 }]);
  });

  it("rejects a series row missing its time bucket", async () => {
    const built = buildQuery(seriesConfig);
    const ch = createFakeChClient([
      { query: built.query, rows: [{ value: "7" }] },
    ]);

    await expect(runMetric(ch, seriesConfig)).rejects.toThrow();
  });
});
