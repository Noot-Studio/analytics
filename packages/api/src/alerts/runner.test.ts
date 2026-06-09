import { describe, expect, it } from "bun:test";

import { createFakeChClient } from "../ch-client.fake";
import type { AlertDeliverer, AlertNotification } from "./delivery";
import {
  buildBaselineDauQuery,
  buildCrashCountQuery,
  buildCurrentDauQuery,
} from "./queries";
import type { AlertRuleRecord, AlertStore } from "./runner";
import {
  ALERT_COOLDOWN_MS,
  evaluateProjectAlerts,
  isInCooldown,
} from "./runner";

const NOW = new Date("2026-06-09T12:00:00.000Z");

// The query strings are constant per builder, so any input yields the SQL key
// the fake matches on.
const CRASH_SQL = buildCrashCountQuery({
  from: "",
  projectId: "",
  to: "",
}).query;
const CURRENT_DAU_SQL = buildCurrentDauQuery({ day: "", projectId: "" }).query;
const BASELINE_DAU_SQL = buildBaselineDauQuery({
  from: "",
  projectId: "",
  to: "",
}).query;

const rule = (overrides: Partial<AlertRuleRecord>): AlertRuleRecord => ({
  channel: "Webhook",
  destination: "https://hooks.test/in",
  id: "rule_1",
  lastFiredAt: null,
  metric: "CrashSpike",
  name: "Crash spike",
  threshold: 10,
  ...overrides,
});

const makeStore = (rules: AlertRuleRecord[]) => {
  const fired: { id: string; firedAt: Date }[] = [];
  const store: AlertStore = {
    listEnabledRules: () => Promise.resolve(rules),
    markFired: (id, firedAt) => {
      fired.push({ firedAt, id });
      return Promise.resolve();
    },
    projectName: () => Promise.resolve("My Game"),
  };
  return { fired, store };
};

const makeDeliverer = () => {
  const webhooks: { url: string; notification: AlertNotification }[] = [];
  const emails: { to: string; notification: AlertNotification }[] = [];
  const deliverer: AlertDeliverer = {
    email: (to, notification) => {
      emails.push({ notification, to });
      return Promise.resolve();
    },
    webhook: (url, notification) => {
      webhooks.push({ notification, url });
      return Promise.resolve();
    },
  };
  return { deliverer, emails, webhooks };
};

describe("isInCooldown", () => {
  it("is false when the rule has never fired", () => {
    expect(isInCooldown(null, NOW)).toBe(false);
  });

  it("is true within the cooldown window", () => {
    const last = new Date(NOW.getTime() - ALERT_COOLDOWN_MS / 2);
    expect(isInCooldown(last, NOW)).toBe(true);
  });

  it("is false once the cooldown has elapsed", () => {
    const last = new Date(NOW.getTime() - ALERT_COOLDOWN_MS - 1);
    expect(isInCooldown(last, NOW)).toBe(false);
  });
});

describe("evaluateProjectAlerts", () => {
  it("fires a crash-spike rule and delivers over the webhook", async () => {
    const ch = createFakeChClient([
      { query: CRASH_SQL, rows: [{ crashes: 12 }] },
    ]);
    const { store, fired } = makeStore([rule({})]);
    const { deliverer, webhooks } = makeDeliverer();

    const firings = await evaluateProjectAlerts(
      { ch, deliverer, now: NOW, store },
      "proj_1"
    );

    expect(firings).toEqual([
      {
        metric: "CrashSpike",
        ruleId: "rule_1",
        ruleName: "Crash spike",
        value: 12,
      },
    ]);
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0]?.url).toBe("https://hooks.test/in");
    expect(webhooks[0]?.notification.projectName).toBe("My Game");
    expect(fired).toEqual([{ firedAt: NOW, id: "rule_1" }]);
  });

  it("does not fire when the metric is below the threshold", async () => {
    const ch = createFakeChClient([
      { query: CRASH_SQL, rows: [{ crashes: 3 }] },
    ]);
    const { store, fired } = makeStore([rule({})]);
    const { deliverer, webhooks } = makeDeliverer();

    const firings = await evaluateProjectAlerts(
      { ch, deliverer, now: NOW, store },
      "proj_1"
    );

    expect(firings).toEqual([]);
    expect(webhooks).toEqual([]);
    expect(fired).toEqual([]);
  });

  it("skips rules still inside their cooldown without querying ClickHouse", async () => {
    // An empty fake throws if any query runs, proving cooldown short-circuits.
    const ch = createFakeChClient([]);
    const recent = new Date(NOW.getTime() - 60 * 1000);
    const { store } = makeStore([rule({ lastFiredAt: recent })]);
    const { deliverer, webhooks } = makeDeliverer();

    const firings = await evaluateProjectAlerts(
      { ch, deliverer, now: NOW, store },
      "proj_1"
    );

    expect(firings).toEqual([]);
    expect(webhooks).toEqual([]);
  });

  it("fires a DAU-drop rule and delivers over email", async () => {
    const ch = createFakeChClient([
      { query: CURRENT_DAU_SQL, rows: [{ dau: 60 }] },
      { query: BASELINE_DAU_SQL, rows: [{ dau: 100 }] },
    ]);
    const { store } = makeStore([
      rule({
        channel: "Email",
        destination: "ops@test.com",
        id: "rule_2",
        metric: "DauDrop",
        name: "DAU drop",
        threshold: 30,
      }),
    ]);
    const { deliverer, emails } = makeDeliverer();

    const firings = await evaluateProjectAlerts(
      { ch, deliverer, now: NOW, store },
      "proj_1"
    );

    expect(firings).toHaveLength(1);
    expect(firings[0]?.value).toBe(40);
    expect(emails).toHaveLength(1);
    expect(emails[0]?.to).toBe("ops@test.com");
  });
});
