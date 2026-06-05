import { describe, expect, it } from "bun:test";

import { buildRecentCountQuery, buildRecentRowsQuery } from "./recent";
import type { RecentInput } from "./recent";

const base: RecentInput = {
  page: 1,
  perPage: 20,
  projectId: "proj_1",
  sortDesc: false,
};

describe("buildRecentRowsQuery", () => {
  it("paginates raw events, default sort timestamp ASC, no time filter", () => {
    const { query, params } = buildRecentRowsQuery(base);
    expect(query).toContain("FROM analytics.events");
    expect(query).toContain("WHERE project_id = {projectId:String}");
    expect(query).toContain("ORDER BY timestamp ASC");
    expect(query).toContain("LIMIT {perPage:UInt32} OFFSET {offset:UInt32}");
    expect(query).not.toContain("timestamp BETWEEN");
    expect(params).toEqual({
      offset: 0,
      perPage: 20,
      projectId: "proj_1",
    });
  });

  it("falls back to timestamp for an unsafe sort column", () => {
    const { query } = buildRecentRowsQuery({
      ...base,
      sortBy: "properties",
      sortDesc: true,
    });
    expect(query).toContain("ORDER BY timestamp DESC");
  });

  it("honours a safelisted sort column", () => {
    const { query } = buildRecentRowsQuery({ ...base, sortBy: "player_id" });
    expect(query).toContain("ORDER BY player_id ASC");
  });

  it("maps page -> offset", () => {
    const { params } = buildRecentRowsQuery({ ...base, page: 4, perPage: 25 });
    expect(params.offset).toBe(75);
  });

  it("adds the BETWEEN clause and strips the ISO Z suffix when from+to set", () => {
    const { query, params } = buildRecentRowsQuery({
      ...base,
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-06-01T00:00:00.000Z",
    });
    expect(query).toContain(
      "timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}"
    );
    expect(params.from).toBe("2026-05-01T00:00:00.000");
    expect(params.to).toBe("2026-06-01T00:00:00.000");
  });

  it("translates advanced filters into WHERE conditions + params", () => {
    const { query, params } = buildRecentRowsQuery({
      ...base,
      filters: [{ operator: "eq", property: "event_type", value: "death" }],
    });
    expect(query).toContain("event_type = {filter_0_value:String}");
    expect(params.filter_0_value).toBe("death");
  });
});

describe("buildRecentCountQuery", () => {
  it("counts over the same WHERE without pagination params", () => {
    const { query, params } = buildRecentCountQuery(base);
    expect(query).toContain("SELECT count() AS total");
    expect(query).toContain("WHERE project_id = {projectId:String}");
    expect(query).not.toContain("LIMIT");
    expect(params).toEqual({ projectId: "proj_1" });
  });

  it("applies the same time + filter conditions as the rows query", () => {
    const { query, params } = buildRecentCountQuery({
      ...base,
      filters: [{ operator: "eq", property: "event_type", value: "death" }],
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-06-01T00:00:00.000Z",
    });
    expect(query).toContain(
      "timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}"
    );
    expect(query).toContain("event_type = {filter_0_value:String}");
    expect(params.filter_0_value).toBe("death");
  });
});
