import { describe, expect, it } from "bun:test";

import {
  buildMapsBreakdownQuery,
  buildMapsOverTimeQuery,
  buildMapsTableCountQuery,
  buildMapsTableQuery,
} from "./maps";
import type { MapsInput } from "./maps";

const base: MapsInput = {
  from: "2026-05-01",
  joinOperator: "and",
  page: 1,
  perPage: 10,
  projectId: "proj_1",
  sortDesc: true,
  to: "2026-06-01",
};

describe("buildMapsBreakdownQuery", () => {
  it("top-50 maps by sessions off the session_maps + durations CTE", () => {
    const { query, params } = buildMapsBreakdownQuery(base);
    expect(query).toContain("WITH session_maps AS");
    expect(query).toContain("durations AS");
    expect(query).toContain("event_type = 'session_start'");
    expect(query).toContain("LEFT JOIN durations AS d USING (session_id)");
    expect(query).toContain("ORDER BY sessions DESC");
    expect(query).toContain("LIMIT 50");
    expect(params).toEqual({
      from: "2026-05-01",
      projectId: "proj_1",
      to: "2026-06-01",
    });
  });
});

describe("buildMapsOverTimeQuery", () => {
  it("per-day sessions per map", () => {
    const { query, params } = buildMapsOverTimeQuery(base);
    expect(query).toContain("WITH session_maps AS");
    expect(query).toContain("GROUP BY event_date, map");
    expect(query).toContain("ORDER BY event_date, sessions DESC");
    expect(params).toEqual({
      from: "2026-05-01",
      projectId: "proj_1",
      to: "2026-06-01",
    });
  });
});

describe("buildMapsTableQuery", () => {
  it("paginates + sorts by sessions DESC by default, no HAVING", () => {
    const { query, params } = buildMapsTableQuery(base);
    expect(query).toContain("ORDER BY sessions DESC");
    expect(query).toContain("LIMIT {perPage:UInt32} OFFSET {offset:UInt32}");
    expect(query).not.toContain("HAVING");
    expect(params).toMatchObject({
      from: "2026-05-01",
      offset: 0,
      perPage: 10,
      projectId: "proj_1",
      to: "2026-06-01",
    });
  });

  it("maps page -> offset and honours sortBy + ascending", () => {
    const { query, params } = buildMapsTableQuery({
      ...base,
      page: 3,
      perPage: 25,
      sortBy: "avg_seconds",
      sortDesc: false,
    });
    expect(query).toContain("ORDER BY avg_seconds ASC");
    expect(params.offset).toBe(50);
    expect(params.perPage).toBe(25);
  });

  it("adds a HAVING clause + bound param for aggregate-alias filters", () => {
    const { query, params } = buildMapsTableQuery({
      ...base,
      filters: [{ operator: "gte", property: "sessions", value: 5 }],
    });
    expect(query).toContain("HAVING");
    expect(query).toContain("sessions >= {filter_0_value:Float64}");
    expect(params.filter_0_value).toBe(5);
  });
});

describe("buildMapsTableCountQuery", () => {
  it("wraps the table select in a count() subquery", () => {
    const { query, params } = buildMapsTableCountQuery(base);
    expect(query).toContain("SELECT count() AS total FROM (");
    expect(query).toContain("WITH session_maps AS");
    expect(query).not.toContain("HAVING");
    expect(params).toEqual({
      from: "2026-05-01",
      projectId: "proj_1",
      to: "2026-06-01",
    });
  });

  it("mirrors the same HAVING filter so the total matches the page", () => {
    const { query, params } = buildMapsTableCountQuery({
      ...base,
      filters: [{ operator: "gte", property: "players", value: 2 }],
    });
    expect(query).toContain("HAVING");
    expect(query).toContain("players >= {filter_0_value:Float64}");
    expect(params.filter_0_value).toBe(2);
  });
});
