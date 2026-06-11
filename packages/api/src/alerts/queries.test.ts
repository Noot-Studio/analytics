import { describe, expect, it } from "bun:test";

import { buildAlertMetricQuery, windowMs } from "./queries";

const NOW = new Date("2026-06-11T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

describe("windowMs", () => {
  it("maps each window to its trailing span", () => {
    expect(windowMs("LastHour")).toBe(HOUR_MS);
    expect(windowMs("Last24Hours")).toBe(24 * HOUR_MS);
    expect(windowMs("Last7Days")).toBe(7 * 24 * HOUR_MS);
  });
});

describe("buildAlertMetricQuery", () => {
  it("merges the metric config with a scalar view over the window and scope", () => {
    const scope = buildAlertMetricQuery({
      config: { aggregation: "count", eventType: "crash" },
      now: NOW,
      projectIds: ["p1", "p2"],
      window: "LastHour",
    });

    expect(scope).toMatchObject({
      aggregation: "count",
      eventType: "crash",
      granularity: "none",
      limit: 1,
      projectId: ["p1", "p2"],
      timeRange: {
        from: "2026-06-11T11:00:00.000Z",
        to: "2026-06-11T12:00:00.000Z",
      },
    });
  });

  it("spans back the full window for a multi-day range", () => {
    const scope = buildAlertMetricQuery({
      config: { aggregation: "unique_players" },
      now: NOW,
      projectIds: ["p1"],
      window: "Last7Days",
    });

    expect(scope.timeRange.from).toBe("2026-06-04T12:00:00.000Z");
  });
});
