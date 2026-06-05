import { describe, expect, it } from "bun:test";

import {
  buildPlayersListCountQuery,
  buildPlayersListQuery,
} from "./players-list";
import type { PlayersListInput } from "./players-list";

const base: PlayersListInput = {
  from: "2026-05-01T00:00:00Z",
  joinOperator: "and",
  page: 1,
  perPage: 10,
  projectId: "proj_1",
  sortDesc: true,
  to: "2026-06-01T00:00:00Z",
};

describe("buildPlayersListQuery", () => {
  it("excludes anonymous players, paginates, default sort last_seen DESC", () => {
    const { query, params } = buildPlayersListQuery(base);
    expect(query).toContain("FROM analytics.events");
    expect(query).toContain("AND player_id != ''");
    expect(query).toContain(
      "timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}"
    );
    expect(query).toContain("GROUP BY player_id");
    expect(query).toContain("ORDER BY last_seen DESC");
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
    const { query, params } = buildPlayersListQuery({
      ...base,
      page: 5,
      perPage: 20,
      sortBy: "events",
      sortDesc: false,
    });
    expect(query).toContain("ORDER BY events ASC");
    expect(params.offset).toBe(80);
  });

  it("falls back to last_seen for an unknown sort column", () => {
    const { query } = buildPlayersListQuery({ ...base, sortBy: "drop_table" });
    expect(query).toContain("ORDER BY last_seen DESC");
  });

  it("adds a HAVING clause + bound param for aggregate-alias filters", () => {
    const { query, params } = buildPlayersListQuery({
      ...base,
      filters: [{ operator: "gte", property: "sessions", value: 3 }],
    });
    expect(query).toContain("HAVING (sessions >= {filter_0_value:Float64})");
    expect(params.filter_0_value).toBe(3);
  });

  it("drops filters whose property is not an allowed column", () => {
    const { params } = buildPlayersListQuery({
      ...base,
      filters: [{ operator: "eq", property: "not_a_column", value: "x" }],
    });
    expect(params).not.toHaveProperty("filter_0_value");
  });
});

describe("buildPlayersListCountQuery", () => {
  it("wraps the player select in a count() subquery", () => {
    const { query, params } = buildPlayersListCountQuery(base);
    expect(query).toContain("SELECT count() AS total FROM (");
    expect(query).toContain("GROUP BY player_id");
    expect(params).not.toHaveProperty("offset");
  });

  it("mirrors the same HAVING filter so the total matches the page", () => {
    const { query, params } = buildPlayersListCountQuery({
      ...base,
      filters: [{ operator: "gte", property: "events", value: 100 }],
    });
    expect(query).toContain("HAVING (events >= {filter_0_value:Float64})");
    expect(params.filter_0_value).toBe(100);
  });
});
