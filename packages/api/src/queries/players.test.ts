import { describe, expect, it } from "bun:test";

import { buildPlayersDailyQuery, buildPlayersTotalsQuery } from "./players";

const input = {
  from: "2026-05-01",
  projectId: "proj_1",
  to: "2026-06-01",
};

describe("buildPlayersDailyQuery", () => {
  it("builds the DAU + new/returning series with the firsts join", () => {
    const { query, params } = buildPlayersDailyQuery(input);
    expect(query).toContain("WITH active AS");
    expect(query).toContain("FROM analytics.player_first_seen");
    expect(query).toContain(
      "toUInt64(uniq(a.player_id))                    AS dau"
    );
    expect(query).toContain("LEFT JOIN firsts AS f USING (player_id)");
    expect(query).toContain("project_id = {projectId:String}");
    expect(query).toContain(
      "toDate(timestamp) BETWEEN {from:Date} AND {to:Date}"
    );
    expect(query).toContain("GROUP BY a.event_date");
    expect(params).toEqual(input);
  });
});

describe("buildPlayersTotalsQuery", () => {
  it("builds trailing WAU/MAU off the 30-day window ending at `to`", () => {
    const { query, params } = buildPlayersTotalsQuery(input);
    expect(query).toContain("FROM analytics.events");
    expect(query).toContain(
      "uniqIf(player_id, timestamp >= {to:Date} - INTERVAL 7 DAY))  AS wau"
    );
    expect(query).toContain(
      "uniqIf(player_id, timestamp >= {to:Date} - INTERVAL 30 DAY)) AS mau"
    );
    expect(query).toContain(
      "toDate(timestamp) BETWEEN ({to:Date} - INTERVAL 30 DAY) AND {to:Date}"
    );
    expect(params).toEqual(input);
  });
});
