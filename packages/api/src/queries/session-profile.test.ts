import { describe, expect, it } from "bun:test";

import {
  buildSessionBreakdownQuery,
  buildSessionFpsQuery,
  buildSessionMetaQuery,
  buildSessionPerfQuery,
  buildSessionSpecsQuery,
} from "./session-profile";
import type { SessionProfileInput } from "./session-profile";

const input: SessionProfileInput = {
  projectId: "proj_1",
  sessionId: "session_1",
};

const expectedParams = { projectId: "proj_1", sessionId: "session_1" };

describe("buildSessionMetaQuery", () => {
  it("aggregates the session meta header", () => {
    const { query, params } = buildSessionMetaQuery(input);
    expect(query).toContain("argMin(player_id, timestamp) AS player_id");
    expect(query).toContain(
      "dateDiff('second', min(timestamp), max(timestamp)) AS duration_seconds"
    );
    expect(query).toContain("session_id = {sessionId:String}");
    expect(params).toEqual(expectedParams);
  });
});

describe("buildSessionPerfQuery", () => {
  it("digests fps, deaths, crashes, and load time", () => {
    const { query, params } = buildSessionPerfQuery(input);
    expect(query).toContain(
      "avgIf(JSONExtractFloat(properties, 'fps'), event_type = 'fps_sample')"
    );
    expect(query).toContain(
      "toUInt64(countIf(event_type = 'player_death')) AS deaths"
    );
    expect(query).toContain(
      "toUInt64(countIf(event_type = 'crash')) AS crashes"
    );
    expect(query).toContain("event_type = 'load_complete'), 0))) AS load_ms");
    expect(params).toEqual(expectedParams);
  });
});

describe("buildSessionFpsQuery", () => {
  it("positions fps samples by seconds since session start", () => {
    const { query, params } = buildSessionFpsQuery(input);
    expect(query).toContain("SELECT min(timestamp) FROM analytics.events");
    expect(query).toContain(
      "toUInt32(dateDiff('second', session_start, timestamp)) AS offset_seconds"
    );
    expect(query).toContain("event_type = 'fps_sample'");
    expect(query).toContain("ORDER BY offset_seconds");
    expect(params).toEqual(expectedParams);
  });
});

describe("buildSessionBreakdownQuery", () => {
  it("counts events per type for the session", () => {
    const { query, params } = buildSessionBreakdownQuery(input);
    expect(query).toContain("toUInt64(count()) AS count");
    expect(query).toContain("GROUP BY event_type");
    expect(query).toContain("ORDER BY count DESC");
    expect(params).toEqual(expectedParams);
  });
});

describe("buildSessionSpecsQuery", () => {
  it("reads session_start hardware specs via argMin", () => {
    const { query, params } = buildSessionSpecsQuery(input);
    expect(query).toContain(
      "argMin(JSONExtractString(properties, 'platform'), timestamp)"
    );
    expect(query).toContain("event_type = 'session_start'");
    expect(query).toContain("toString(min(timestamp)) AS captured_at");
    expect(params).toEqual(expectedParams);
  });
});
