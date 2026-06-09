import { describe, expect, it } from "bun:test";

import {
  buildBaselineDauQuery,
  buildCrashCountQuery,
  buildCurrentDauQuery,
} from "./queries";

describe("buildCrashCountQuery", () => {
  it("counts crash events over the project + time window", () => {
    const { query, params } = buildCrashCountQuery({
      from: "2026-06-09T11:00:00.000Z",
      projectId: "proj_1",
      to: "2026-06-09T12:00:00.000Z",
    });
    expect(query).toContain("FROM analytics.events");
    expect(query).toContain("event_type = 'crash'");
    expect(query).toContain("timestamp >= {from:DateTime64(3)}");
    expect(query).toContain("timestamp < {to:DateTime64(3)}");
    // The ISO `Z` suffix is stripped for DateTime64 binding.
    expect(params).toEqual({
      from: "2026-06-09T11:00:00.000",
      projectId: "proj_1",
      to: "2026-06-09T12:00:00.000",
    });
  });
});

describe("buildCurrentDauQuery", () => {
  it("counts distinct players on the given day", () => {
    const { query, params } = buildCurrentDauQuery({
      day: "2026-06-09",
      projectId: "proj_1",
    });
    expect(query).toContain("uniq(player_id) AS dau");
    expect(query).toContain("toDate(timestamp) = {day:Date}");
    expect(params).toEqual({ day: "2026-06-09", projectId: "proj_1" });
  });
});

describe("buildBaselineDauQuery", () => {
  it("averages daily DAU across the baseline range", () => {
    const { query, params } = buildBaselineDauQuery({
      from: "2026-06-02",
      projectId: "proj_1",
      to: "2026-06-08",
    });
    expect(query).toContain("round(avg(daily_dau)) AS dau");
    expect(query).toContain(
      "toDate(timestamp) BETWEEN {from:Date} AND {to:Date}"
    );
    expect(params).toEqual({
      from: "2026-06-02",
      projectId: "proj_1",
      to: "2026-06-08",
    });
  });
});
