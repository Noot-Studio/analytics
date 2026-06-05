import { describe, expect, it } from "bun:test";

import {
  buildPlayerSessionsCountQuery,
  buildPlayerSessionsQuery,
} from "./player-sessions";
import type { PlayerSessionsInput } from "./player-sessions";

const base: PlayerSessionsInput = {
  joinOperator: "and",
  page: 1,
  perPage: 10,
  playerId: "player_1",
  projectId: "proj_1",
  sortDesc: true,
};

describe("buildPlayerSessionsQuery", () => {
  it("groups per session and paginates, default sort started_at DESC", () => {
    const { query, params } = buildPlayerSessionsQuery(base);
    expect(query).toContain("FROM analytics.events");
    expect(query).toContain("GROUP BY session_id");
    expect(query).toContain(
      "dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds"
    );
    expect(query).toContain("ORDER BY started_at DESC");
    expect(query).toContain("LIMIT {perPage:Int32}");
    expect(query).toContain("OFFSET {offset:Int32}");
    expect(params).toMatchObject({
      offset: 0,
      perPage: 10,
      playerId: "player_1",
      projectId: "proj_1",
    });
    expect(params).not.toHaveProperty("filter_0_value");
  });

  it("maps page -> offset and honours sortBy + ascending", () => {
    const { query, params } = buildPlayerSessionsQuery({
      ...base,
      page: 3,
      perPage: 25,
      sortBy: "event_count",
      sortDesc: false,
    });
    expect(query).toContain("ORDER BY event_count ASC");
    expect(params.offset).toBe(50);
    expect(params.perPage).toBe(25);
  });

  it("adds a HAVING clause + bound param for aggregate-alias filters", () => {
    const { query, params } = buildPlayerSessionsQuery({
      ...base,
      filters: [{ operator: "gte", property: "duration_seconds", value: 60 }],
    });
    expect(query).toContain(
      "HAVING (duration_seconds >= {filter_0_value:Float64})"
    );
    expect(params.filter_0_value).toBe(60);
  });

  it("drops filters whose property is not an allowed column", () => {
    const { params } = buildPlayerSessionsQuery({
      ...base,
      filters: [{ operator: "eq", property: "not_a_column", value: "x" }],
    });
    expect(params).not.toHaveProperty("filter_0_value");
  });
});

describe("buildPlayerSessionsCountQuery", () => {
  it("wraps the per-session select in a count() subquery", () => {
    const { query, params } = buildPlayerSessionsCountQuery(base);
    expect(query).toContain("SELECT count() AS total");
    expect(query).toContain("GROUP BY session_id");
    expect(params).toMatchObject({
      playerId: "player_1",
      projectId: "proj_1",
    });
    expect(params).not.toHaveProperty("offset");
  });

  it("mirrors the same HAVING filter so the total matches the page", () => {
    const { query, params } = buildPlayerSessionsCountQuery({
      ...base,
      filters: [{ operator: "gte", property: "event_count", value: 5 }],
    });
    expect(query).toContain("HAVING (event_count >= {filter_0_value:Float64})");
    expect(params.filter_0_value).toBe(5);
  });
});
