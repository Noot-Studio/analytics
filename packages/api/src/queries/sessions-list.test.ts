import { describe, expect, it } from "bun:test";

import {
  buildSessionsListCountQuery,
  buildSessionsListQuery,
} from "./sessions-list";
import type { SessionsListInput } from "./sessions-list";

const base: SessionsListInput = {
  from: "2026-05-01T00:00:00Z",
  joinOperator: "and",
  page: 1,
  perPage: 10,
  projectId: "proj_1",
  sortDesc: true,
  to: "2026-06-01T00:00:00Z",
};

describe("buildSessionsListQuery", () => {
  it("groups per session, paginates, default sort started_at DESC", () => {
    const { query, params } = buildSessionsListQuery(base);
    expect(query).toContain("FROM analytics.events");
    expect(query).toContain("argMin(player_id, timestamp) AS player_id");
    expect(query).toContain(
      "timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}"
    );
    expect(query).toContain("GROUP BY session_id");
    expect(query).toContain("ORDER BY started_at DESC");
    expect(query).toContain("LIMIT {perPage:UInt32} OFFSET {offset:UInt32}");
    // ClickHouse DateTime64 rejects the ISO `Z` suffix.
    expect(params.from).toBe("2026-05-01T00:00:00");
    expect(params.to).toBe("2026-06-01T00:00:00");
    expect(params).toMatchObject({
      offset: 0,
      perPage: 10,
      projectId: "proj_1",
    });
  });

  it("maps page -> offset and honours sortBy + ascending", () => {
    const { query, params } = buildSessionsListQuery({
      ...base,
      page: 2,
      perPage: 50,
      sortBy: "duration_seconds",
      sortDesc: false,
    });
    expect(query).toContain("ORDER BY duration_seconds ASC");
    expect(params.offset).toBe(50);
  });

  it("falls back to started_at for an unknown sort column", () => {
    const { query } = buildSessionsListQuery({ ...base, sortBy: "drop_table" });
    expect(query).toContain("ORDER BY started_at DESC");
  });

  it("adds a HAVING clause + bound param for aggregate-alias filters", () => {
    const { query, params } = buildSessionsListQuery({
      ...base,
      filters: [{ operator: "gte", property: "event_count", value: 10 }],
    });
    expect(query).toContain("HAVING (event_count >= {filter_0_value:Float64})");
    expect(params.filter_0_value).toBe(10);
  });

  it("drops filters whose property is not an allowed column", () => {
    const { params } = buildSessionsListQuery({
      ...base,
      filters: [{ operator: "eq", property: "not_a_column", value: "x" }],
    });
    expect(params).not.toHaveProperty("filter_0_value");
  });
});

describe("buildSessionsListCountQuery", () => {
  it("wraps the session select in a count() subquery", () => {
    const { query, params } = buildSessionsListCountQuery(base);
    expect(query).toContain("SELECT count() AS total FROM (");
    expect(query).toContain("GROUP BY session_id");
    expect(params).not.toHaveProperty("offset");
  });

  it("mirrors the same HAVING filter so the total matches the page", () => {
    const { query, params } = buildSessionsListCountQuery({
      ...base,
      filters: [{ operator: "eq", property: "map", value: "dm_lobby" }],
    });
    expect(query).toContain("HAVING (map = {filter_0_value:String})");
    expect(params.filter_0_value).toBe("dm_lobby");
  });
});
