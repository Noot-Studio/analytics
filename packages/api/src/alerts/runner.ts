// Alert evaluation orchestration. Sits above three seams — a ClickHouse client
// (../ch-client), an AlertStore (rule persistence), and an AlertDeliverer
// (./delivery) — so the whole pipeline runs against in-memory fakes in tests.
import { z } from "zod";

import type { ChClient } from "../ch-client";
import { runQuery } from "../run-query";
import type { AlertNotification, AlertDeliverer } from "./delivery";
import { deliverNotification } from "./delivery";
import type { AlertMetricName } from "./evaluate";
import { evaluateCrashSpike, evaluateDauDrop } from "./evaluate";
import {
  buildBaselineDauQuery,
  buildCrashCountQuery,
  buildCurrentDauQuery,
} from "./queries";

// The crash-spike lookback window.
const CRASH_WINDOW_MS = 60 * 60 * 1000;
// Days of history averaged into the DAU baseline (the days before today).
const DAU_BASELINE_DAYS = 7;
// A breached rule won't re-notify until this long after its last firing.
export const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

// The [from, to) crash window ending at `now`.
export const crashWindow = (now: Date): { from: string; to: string } => ({
  from: new Date(now.getTime() - CRASH_WINDOW_MS).toISOString(),
  to: now.toISOString(),
});

// The current day plus the inclusive baseline range that precedes it.
export const dauWindow = (
  now: Date
): { day: string; from: string; to: string } => ({
  day: isoDay(now),
  from: isoDay(new Date(now.getTime() - DAU_BASELINE_DAYS * MS_PER_DAY)),
  to: isoDay(new Date(now.getTime() - MS_PER_DAY)),
});

// Whether a rule that last fired at `lastFiredAt` is still inside its cooldown.
export const isInCooldown = (
  lastFiredAt: Date | null,
  now: Date,
  cooldownMs: number = ALERT_COOLDOWN_MS
): boolean =>
  lastFiredAt !== null && now.getTime() - lastFiredAt.getTime() < cooldownMs;

// One persisted rule, narrowed to the fields evaluation needs.
export interface AlertRuleRecord {
  id: string;
  name: string;
  metric: AlertMetricName;
  threshold: number;
  channel: "Webhook" | "Email";
  destination: string;
  lastFiredAt: Date | null;
}

// Persistence seam — the production implementation (see ./live) is Prisma.
export interface AlertStore {
  listEnabledRules(projectId: string): Promise<AlertRuleRecord[]>;
  projectName(projectId: string): Promise<string | null>;
  markFired(id: string, firedAt: Date): Promise<void>;
}

export interface AlertRunnerDeps {
  ch: ChClient;
  store: AlertStore;
  deliverer: AlertDeliverer;
  now: Date;
}

export interface AlertFiring {
  ruleId: string;
  ruleName: string;
  metric: AlertMetricName;
  value: number;
}

const crashRow = z.object({ crashes: z.coerce.number() });
const dauRow = z.object({ dau: z.coerce.number() });

const firstNumber = (rows: { crashes: number }[]): number =>
  rows[0]?.crashes ?? 0;
const firstDau = (rows: { dau: number }[]): number => rows[0]?.dau ?? 0;

// Evaluate every enabled rule for a project and deliver any breaches. Each
// metric's ClickHouse query runs at most once, and only when a rule eligible to
// fire (enabled, past cooldown) actually needs it. Returns the rules that fired.
export const evaluateProjectAlerts = async (
  deps: AlertRunnerDeps,
  projectId: string
): Promise<AlertFiring[]> => {
  const rules = await deps.store.listEnabledRules(projectId);
  const eligible = rules.filter(
    (rule) => !isInCooldown(rule.lastFiredAt, deps.now)
  );
  if (eligible.length === 0) {
    return [];
  }

  const needsCrash = eligible.some((rule) => rule.metric === "CrashSpike");
  const needsDau = eligible.some((rule) => rule.metric === "DauDrop");

  const crashes = needsCrash
    ? firstNumber(
        await runQuery(
          deps.ch,
          buildCrashCountQuery({ projectId, ...crashWindow(deps.now) }),
          crashRow
        )
      )
    : 0;

  let currentDau = 0;
  let baselineDau = 0;
  if (needsDau) {
    const window = dauWindow(deps.now);
    const [current, baseline] = await Promise.all([
      runQuery(
        deps.ch,
        buildCurrentDauQuery({ day: window.day, projectId }),
        dauRow
      ),
      runQuery(
        deps.ch,
        buildBaselineDauQuery({ from: window.from, projectId, to: window.to }),
        dauRow
      ),
    ]);
    currentDau = firstDau(current);
    baselineDau = firstDau(baseline);
  }

  const projectName = (await deps.store.projectName(projectId)) ?? projectId;
  const firedAt = deps.now.toISOString();
  const firings: AlertFiring[] = [];

  for (const rule of eligible) {
    const breach =
      rule.metric === "CrashSpike"
        ? evaluateCrashSpike(rule.threshold, { crashes })
        : evaluateDauDrop(rule.threshold, { baselineDau, currentDau });
    if (!breach) {
      continue;
    }

    const notification: AlertNotification = {
      firedAt,
      metric: rule.metric,
      projectId,
      projectName,
      ruleId: rule.id,
      ruleName: rule.name,
      summary: breach.summary,
      threshold: breach.threshold,
      value: breach.value,
    };

    await deliverNotification(
      deps.deliverer,
      rule.channel,
      rule.destination,
      notification
    );
    await deps.store.markFired(rule.id, deps.now);
    firings.push({
      metric: rule.metric,
      ruleId: rule.id,
      ruleName: rule.name,
      value: breach.value,
    });
  }

  return firings;
};
