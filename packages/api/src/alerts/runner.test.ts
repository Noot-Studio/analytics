import { describe, expect, it } from "bun:test";

import { createFakeChClient } from "../ch-client.fake";
import type { AlertNotification, AlertNotifier } from "./delivery";
import { buildCrashCountQuery, buildDauWindowQuery } from "./queries";
import { runAlerts } from "./runner";
import type { ResolvedAlertRule } from "./runner";

const NOW = new Date("2026-06-11T12:00:00.000Z");

// SQL is param-independent, so any inputs yield the canned-response key.
const CRASH_SQL = buildCrashCountQuery({ projectIds: [], since: "" }).query;
const DAU_SQL = buildDauWindowQuery({
  baselineFrom: "",
  projectIds: [],
  today: "",
}).query;

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
  metric: "CrashSpike",
  name: "Crash watch",
  projectIds: ["p1"],
  scopeLabel: "project Galaxy Wars",
  threshold: 10,
  ...overrides,
});

describe("runAlerts", () => {
  it("fires and notifies when a crash spike breaches the threshold", async () => {
    const ch = createFakeChClient([
      { query: CRASH_SQL, rows: [{ crashes: 12 }] },
    ]);
    const notifier = recordingNotifier();

    const results = await runAlerts({ ch, notifier, now: NOW }, [crashRule()]);

    expect(results).toMatchObject([
      { fired: true, notified: true, ruleId: "rule_crash" },
    ]);
    expect(notifier.sent).toMatchObject([
      {
        channel: "Webhook",
        destination: "https://hooks.example.com/x",
        metricLabel: "Crash spike",
        ruleName: "Crash watch",
        scopeLabel: "project Galaxy Wars",
      },
    ]);
  });

  it("does not fire below the threshold", async () => {
    const ch = createFakeChClient([
      { query: CRASH_SQL, rows: [{ crashes: 3 }] },
    ]);
    const notifier = recordingNotifier();

    const results = await runAlerts({ ch, notifier, now: NOW }, [crashRule()]);

    expect(results).toMatchObject([{ fired: false, notified: false }]);
    expect(notifier.sent).toHaveLength(0);
  });

  it("suppresses a repeat notification within the cooldown", async () => {
    const ch = createFakeChClient([
      { query: CRASH_SQL, rows: [{ crashes: 50 }] },
    ]);
    const notifier = recordingNotifier();

    const results = await runAlerts({ ch, notifier, now: NOW }, [
      // Last fired 30 minutes ago, inside the 1h cooldown.
      crashRule({ lastFiredAt: new Date(NOW.getTime() - 30 * 60 * 1000) }),
    ]);

    expect(results).toMatchObject([{ fired: true, notified: false }]);
    expect(notifier.sent).toHaveLength(0);
  });

  it("fires a DAU drop against the trailing baseline", async () => {
    const ch = createFakeChClient([
      { query: DAU_SQL, rows: [{ baseline_dau: 100, current_dau: 10 }] },
    ]);
    const notifier = recordingNotifier();

    const results = await runAlerts({ ch, notifier, now: NOW }, [
      crashRule({
        channel: "Email",
        destination: "ops@example.com",
        id: "rule_dau",
        metric: "DauDrop",
        name: "DAU watch",
        threshold: 50,
      }),
    ]);

    expect(results).toMatchObject([
      { fired: true, notified: true, ruleId: "rule_dau" },
    ]);
    expect(notifier.sent).toMatchObject([
      { channel: "Email", metricLabel: "DAU drop" },
    ]);
  });
});
