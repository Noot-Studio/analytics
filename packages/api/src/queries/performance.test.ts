import { describe, expect, it } from "bun:test";

import {
  buildPerformanceByMapQuery,
  buildPerformanceCrashQuery,
  buildPerformanceFpsQuery,
  buildPerformanceLoadQuery,
} from "./performance";
import type { PerformanceInput } from "./performance";

const base: PerformanceInput = {
  from: "2026-05-01",
  mapJoinOperator: "and",
  mapSortDesc: false,
  projectId: "proj_1",
  to: "2026-06-01",
};

const windowParams = {
  from: "2026-05-01",
  projectId: "proj_1",
  to: "2026-06-01",
};

describe("buildPerformanceFpsQuery", () => {
  it("computes daily fps percentiles from fps_sample events", () => {
    const { query, params } = buildPerformanceFpsQuery(base);
    expect(query).toContain("event_type = 'fps_sample'");
    expect(query).toContain(
      "round(quantile(0.5)(JSONExtractFloat(properties, 'fps')), 1) AS p50"
    );
    expect(query).toContain("quantile(0.99)");
    expect(query).toContain("GROUP BY event_date");
    expect(params).toEqual(windowParams);
  });
});

describe("buildPerformanceCrashQuery", () => {
  it("computes daily crashes, sessions, and crash rate", () => {
    const { query, params } = buildPerformanceCrashQuery(base);
    expect(query).toContain("countIf(event_type = 'crash') AS crashes");
    expect(query).toContain("uniq(session_id) AS sessions");
    expect(query).toContain(
      "round(countIf(event_type = 'crash') / uniq(session_id), 4) AS crash_rate"
    );
    expect(params).toEqual(windowParams);
  });
});

describe("buildPerformanceLoadQuery", () => {
  it("buckets load_complete durations into a histogram", () => {
    const { query, params } = buildPerformanceLoadQuery(base);
    expect(query).toContain("WITH JSONExtractFloat(properties, 'ms') AS ms");
    expect(query).toContain("event_type = 'load_complete'");
    expect(query).toContain("'5s+') AS bucket");
    expect(query).toContain("GROUP BY bucket, bucket_index");
    expect(query).toContain("ORDER BY bucket_index");
    expect(params).toEqual(windowParams);
  });
});

describe("buildPerformanceByMapQuery", () => {
  it("guards map != '' and sorts by avg_fps ASC by default", () => {
    const { query, params } = buildPerformanceByMapQuery(base);
    expect(query).toContain("event_type IN ('fps_sample', 'crash')");
    expect(query).toContain("GROUP BY map");
    expect(query).toContain("HAVING map != ''");
    expect(query).toContain("ORDER BY avg_fps ASC");
    expect(query).toContain("LIMIT 50");
    expect(params).toEqual(windowParams);
  });

  it("honours mapSortBy + descending direction", () => {
    const { query } = buildPerformanceByMapQuery({
      ...base,
      mapSortBy: "crashes",
      mapSortDesc: true,
    });
    expect(query).toContain("ORDER BY crashes DESC");
  });

  it("extends the HAVING guard with aggregate-alias filters", () => {
    const { query, params } = buildPerformanceByMapQuery({
      ...base,
      mapFilters: [{ operator: "gte", property: "avg_fps", value: 30 }],
    });
    expect(query).toContain("HAVING map != '' AND");
    expect(query).toContain("avg_fps >= {filter_0_value:Float64}");
    expect(params.filter_0_value).toBe(30);
  });

  it("drops filters whose property is not an allowed map column", () => {
    const { query } = buildPerformanceByMapQuery({
      ...base,
      mapFilters: [{ operator: "eq", property: "not_a_column", value: "x" }],
    });
    expect(query).toContain("HAVING map != ''");
    expect(query).not.toContain("AND (");
  });
});
