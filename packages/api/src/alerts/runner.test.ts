import { describe, expect, it } from "bun:test";

import { createFakeChClient } from "../ch-client.fake";
import type { MetricConfig } from "../metrics";
import { buildQuery } from "../query-builder";
import type { AlertNotification, AlertNotifier } from "./delivery";
import { buildAlertMetricQuery } from "./queries";
import { runAlerts } from "./runner";
import type { ResolvedAlertRule } from "./runner";

const NOW = new Date("2026-06-11T12:00:00.000Z");

const CRASH_CONFIG: MetricConfig = { aggregation: "count", eventType: "crash" };
const FPS_CONFIG: MetricConfig = {
  aggregateProperty: "fps",
  aggregation: "avg",
};

// The SQL a rule produces is param-independent, so any concrete scope/window
// yields the canned-response key the runner will hit.
const sqlFor = (rule: ResolvedAlertRule): string =>
  buildQuery(
    buildAlertMetricQuery({
      config: rule.metricConfig,
      now: NOW,
      projectIds: rule.projectIds,
      window: rule.window,
    })
  ).query;

const recordingNotifier = (): AlertNotifier & { sent: AlertNotification[] } => {
  const sent: AlertNotification[] = [];
  return {
    notify(notification) {
      sent.push(notification);
      return Promise.resolve();
    },
    sent,
  };
};

const crashRule = (
  overrides: Partial<ResolvedAlertRule> = {}
): ResolvedAlertRule => ({
  channel: "Webhook",
  destination: "https://hooks.example.com/x",
  id: "rule_crash",
  lastFiredAt: null,
  metricConfig: CRASH_CONFIG,
  metricName: "Crashes",
  name: "Crash watch",
  operator: "Above",
  projectIds: ["p1"],
  scopeLabel: "project Galaxy Wars",
  threshold: 10,
  window: "LastHour",
  ...overrides,
});

describe("runAlerts", () => {
  it("fires and notifies when the metric breaches an Above threshold", async () => {
    const rule = crashRule();
    const ch = createFakeChClient([
      { query: sqlFor(rule), rows: [{ value: 12 }] },
    ]);
    const notifier = recordingNotifier();

    const results = await runAlerts({ ch, notifier, now: NOW }, [rule]);

    expect(results).toMatchObject([
      { fired: true, notified: true, ruleId: "rule_crash" },
    ]);
    expect(notifier.sent).toMatchObject([
      {
        channel: "Webhook",
        destination: "https://hooks.example.com/x",
        metricLabel: "Crashes",
        ruleName: "Crash watch",
        scopeLabel: "project Galaxy Wars",
      },
    ]);
  });

  it("does not fire below the threshold", async () => {
    const rule = crashRule();
    const ch = createFakeChClient([
      { query: sqlFor(rule), rows: [{ value: 3 }] },
    ]);
    const notifier = recordingNotifier();

    const results = await runAlerts({ ch, notifier, now: NOW }, [rule]);

    expect(results).toMatchObject([{ fired: false, notified: false }]);
    expect(notifier.sent).toHaveLength(0);
  });

  it("suppresses a repeat notification within the cooldown", async () => {
    const rule = crashRule({
      // Last fired 30 minutes ago, inside the 1h cooldown.
      lastFiredAt: new Date(NOW.getTime() - 30 * 60 * 1000),
    });
    const ch = createFakeChClient([
      { query: sqlFor(rule), rows: [{ value: 50 }] },
    ]);
    const notifier = recordingNotifier();

    const results = await runAlerts({ ch, notifier, now: NOW }, [rule]);

    expect(results).toMatchObject([{ fired: true, notified: false }]);
    expect(notifier.sent).toHaveLength(0);
  });

  it("fires a Below rule when the metric drops to the threshold", async () => {
    const rule = crashRule({
      channel: "Email",
      destination: "ops@example.com",
      id: "rule_fps",
      metricConfig: FPS_CONFIG,
      metricName: "Avg FPS",
      name: "Perf watch",
      operator: "Below",
      threshold: 30,
    });
    const ch = createFakeChClient([
      { query: sqlFor(rule), rows: [{ value: 18 }] },
    ]);
    const notifier = recordingNotifier();

    const results = await runAlerts({ ch, notifier, now: NOW }, [rule]);

    expect(results).toMatchObject([
      { fired: true, notified: true, ruleId: "rule_fps" },
    ]);
    expect(notifier.sent).toMatchObject([
      { channel: "Email", metricLabel: "Avg FPS" },
    ]);
  });
});
