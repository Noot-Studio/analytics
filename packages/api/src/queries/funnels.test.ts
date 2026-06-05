import { describe, expect, it } from "bun:test";

import {
  buildFunnelsLevelsQuery,
  buildFunnelsTrendQuery,
  DEFAULT_FUNNEL_WINDOW_SECONDS,
  MAX_FUNNEL_STEPS,
  MIN_FUNNEL_STEPS,
} from "./funnels";
import type { FunnelsInput } from "./funnels";

const twoStep: FunnelsInput = {
  from: "2026-05-01",
  projectId: "proj_1",
  steps: ["session_start", "level_complete"],
  to: "2026-06-01",
  windowSeconds: 3600,
};

const eightStep: FunnelsInput = {
  ...twoStep,
  steps: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"],
};

describe("funnel step-count constants", () => {
  it("exposes the bounds the router's zod schema constrains on", () => {
    expect(MIN_FUNNEL_STEPS).toBe(2);
    expect(MAX_FUNNEL_STEPS).toBe(8);
    expect(DEFAULT_FUNNEL_WINDOW_SECONDS).toBe(86_400);
  });
});

describe("buildFunnelsLevelsQuery", () => {
  it("builds the windowFunnel CTE and counts players per level", () => {
    const { query, params } = buildFunnelsLevelsQuery(twoStep);
    expect(query).toContain("WITH levels AS");
    expect(query).toContain("windowFunnel({window:UInt32})(timestamp,");
    expect(query).toContain("event_type IN {steps:Array(String)}");
    expect(query).toContain("SELECT level, toUInt64(count()) AS players");
    expect(query).toContain("WHERE level > 0");
    expect(query).toContain("GROUP BY level");
    expect(params.window).toBe(3600);
    expect(params.steps).toEqual(["session_start", "level_complete"]);
  });

  it("emits one event_type condition + step param per step (2 steps)", () => {
    const { query, params } = buildFunnelsLevelsQuery(twoStep);
    expect(query).toContain(
      "event_type = {s0:String}, event_type = {s1:String}"
    );
    expect(query).not.toContain("{s2:String}");
    expect(params.s0).toBe("session_start");
    expect(params.s1).toBe("level_complete");
  });

  it("scales the conditions + step params to 8 steps", () => {
    const { query, params } = buildFunnelsLevelsQuery(eightStep);
    for (let i = 0; i < MAX_FUNNEL_STEPS; i += 1) {
      expect(query).toContain(`event_type = {s${i}:String}`);
      expect(params[`s${i}`]).toBe(eightStep.steps[i]);
    }
    expect(query).not.toContain("{s8:String}");
  });
});

describe("buildFunnelsTrendQuery", () => {
  it("derives started vs completed against the full-level threshold", () => {
    const { query, params } = buildFunnelsTrendQuery(twoStep);
    expect(query).toContain("WITH levels AS");
    expect(query).toContain(
      "toUInt64(count())                              AS started"
    );
    expect(query).toContain(
      "toUInt64(countIf(level >= {fullLevel:UInt8}))  AS completed"
    );
    expect(query).toContain("GROUP BY first_day");
    // fullLevel equals the step count, so completion means reaching every step.
    expect(params.fullLevel).toBe(2);
  });

  it("sets fullLevel to the step count for an 8-step funnel", () => {
    const { params } = buildFunnelsTrendQuery(eightStep);
    expect(params.fullLevel).toBe(8);
  });
});
