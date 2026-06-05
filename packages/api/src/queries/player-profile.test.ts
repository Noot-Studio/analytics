import { describe, expect, it } from "bun:test";

import {
  buildPlayerActivityQuery,
  buildPlayerEventBreakdownQuery,
  buildPlayerHistogramQuery,
  buildPlayerHourGridQuery,
  buildPlayerLifetimeQuery,
  buildPlayerMapsQuery,
  buildPlayerRetentionQuery,
  buildPlayerSpecsQuery,
  buildPlayerTimelineQuery,
} from "./player-profile";
import type { PlayerProfileInput } from "./player-profile";

const input: PlayerProfileInput = {
  playerId: "player_1",
  projectId: "proj_1",
};

const expectedParams = { playerId: "player_1", projectId: "proj_1" };

describe("buildPlayerLifetimeQuery", () => {
  it("derives lifetime stats from the shared player_sessions CTE", () => {
    const { query, params } = buildPlayerLifetimeQuery(input);
    expect(query).toContain("WITH player_sessions AS");
    expect(query).toContain("AS first_seen");
    expect(query).toContain("uniq(session_id) AS total_sessions");
    expect(query).toContain("FROM player_sessions) AS avg_session_seconds");
    expect(query).toContain("FROM player_sessions) AS median_session_seconds");
    expect(query).toContain("project_id = {projectId:String}");
    expect(query).toContain("player_id = {playerId:String}");
    expect(params).toEqual(expectedParams);
  });
});

describe("buildPlayerActivityQuery", () => {
  it("returns the last 84 days of daily activity", () => {
    const { query, params } = buildPlayerActivityQuery(input);
    expect(query).toContain("timestamp >= now() - INTERVAL 84 DAY");
    expect(query).toContain("GROUP BY day");
    expect(query).toContain("ORDER BY day");
    expect(params).toEqual(expectedParams);
  });
});

describe("buildPlayerHourGridQuery", () => {
  it("buckets events by weekday and hour", () => {
    const { query, params } = buildPlayerHourGridQuery(input);
    expect(query).toContain("toUInt8(toDayOfWeek(timestamp)) AS weekday");
    expect(query).toContain("toUInt8(toHour(timestamp))      AS hour");
    expect(query).toContain("GROUP BY weekday, hour");
    expect(params).toEqual(expectedParams);
  });
});

describe("buildPlayerEventBreakdownQuery", () => {
  it("counts events per type, ordered by count", () => {
    const { query, params } = buildPlayerEventBreakdownQuery(input);
    expect(query).toContain("toUInt64(count()) AS count");
    expect(query).toContain("GROUP BY event_type");
    expect(query).toContain("ORDER BY count DESC");
    expect(params).toEqual(expectedParams);
  });
});

describe("buildPlayerMapsQuery", () => {
  it("aggregates sessions and playtime per map from the CTE", () => {
    const { query, params } = buildPlayerMapsQuery(input);
    expect(query).toContain("WITH player_sessions AS");
    expect(query).toContain(
      "toUInt64(sum(duration_seconds)) AS playtime_seconds"
    );
    expect(query).toContain("FROM player_sessions");
    expect(query).toContain("ORDER BY sessions DESC, map ASC");
    expect(params).toEqual(expectedParams);
  });
});

describe("buildPlayerHistogramQuery", () => {
  it("buckets per-session durations from the CTE", () => {
    const { query, params } = buildPlayerHistogramQuery(input);
    expect(query).toContain("WITH player_sessions AS");
    expect(query).toContain("'30m+') AS bucket");
    expect(query).toContain("FROM player_sessions");
    expect(query).toContain("ORDER BY sort");
    expect(params).toEqual(expectedParams);
  });
});

describe("buildPlayerSpecsQuery", () => {
  it("reads the latest session_start hardware specs", () => {
    const { query, params } = buildPlayerSpecsQuery(input);
    expect(query).toContain(
      "argMax(JSONExtractString(properties, 'platform'), timestamp)"
    );
    expect(query).toContain("event_type = 'session_start'");
    expect(query).toContain("toString(max(timestamp)) AS captured_at");
    expect(params).toEqual(expectedParams);
  });
});

describe("buildPlayerTimelineQuery", () => {
  it("returns the 100 most recent events", () => {
    const { query, params } = buildPlayerTimelineQuery(input);
    expect(query).toContain("ORDER BY timestamp DESC");
    expect(query).toContain("LIMIT 100");
    expect(params).toEqual(expectedParams);
  });
});

describe("buildPlayerRetentionQuery", () => {
  it("flags retention at d1/d7/d30 against the cohort day", () => {
    const { query, params } = buildPlayerRetentionQuery(input);
    expect(query).toContain("SELECT min(toDate(timestamp))");
    expect(query).toContain(
      "countIf(toDate(timestamp) = cohort + 1) > 0 AS retained_d1"
    );
    expect(query).toContain(
      "countIf(toDate(timestamp) = cohort + 7) > 0 AS retained_d7"
    );
    expect(query).toContain(
      "countIf(toDate(timestamp) = cohort + 30) > 0 AS retained_d30"
    );
    expect(params).toEqual(expectedParams);
  });
});
