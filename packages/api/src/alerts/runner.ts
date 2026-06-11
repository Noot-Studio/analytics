// The alert evaluation pipeline: query -> evaluate -> deliver, with a cooldown.
// It depends only on the ChClient and AlertNotifier seams plus an injected
// clock, never on Prisma — the router loads the rules, expands their scope, and
// persists `lastFiredAt`. That keeps the whole pipeline testable end-to-end
// against in-memory fakes.
import type { AlertChannel, AlertMetric } from "@sbox-analytics/db";
import { z } from "zod";

import type { ChClient } from "../ch-client";
import { runQuery } from "../run-query";
import type { AlertNotifier } from "./delivery";
import { evaluateCrashSpike, evaluateDauDrop } from "./evaluate";
import { buildCrashCountQuery, buildDauWindowQuery } from "./queries";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DAU_BASELINE_DAYS = 7;

// A sustained breach shouldn't re-notify on every check; suppress repeat
// notifications within this window of the last delivery.
export const DEFAULT_COOLDOWN_MS = HOUR_MS;

const METRIC_LABELS: Record<AlertMetric, string> = {
  CrashSpike: "Crash spike",
  DauDrop: "DAU drop",
};

// A rule with its scope already expanded to the concrete project ids it covers
// (one for a project rule, every org project for an org rule).
export interface ResolvedAlertRule {
  id: string;
  name: string;
  metric: AlertMetric;
  threshold: number;
  channel: AlertChannel;
  destination: string;
  lastFiredAt: Date | null;
  projectIds: string[];
  scopeLabel: string;
}

export interface AlertRunResult {
  ruleId: string;
  fired: boolean;
  summary: string;
  /** True when a notification was actually delivered (fired and not cooled). */
  notified: boolean;
}

const crashRow = z.object({ crashes: z.coerce.number() });
const dauRow = z.object({
  baseline_dau: z.coerce.number(),
  current_dau: z.coerce.number(),
});

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const evaluateRule = async (
  ch: ChClient,
  rule: ResolvedAlertRule,
  now: Date
): Promise<{ fired: boolean; summary: string }> => {
  if (rule.metric === "CrashSpike") {
    const since = new Date(now.getTime() - HOUR_MS).toISOString();
    const rows = await runQuery(
      ch,
      buildCrashCountQuery({ projectIds: rule.projectIds, since }),
      crashRow
    );
    return evaluateCrashSpike(rows[0]?.crashes ?? 0, rule.threshold);
  }

  const rows = await runQuery(
    ch,
    buildDauWindowQuery({
      baselineFrom: isoDate(
        new Date(now.getTime() - DAU_BASELINE_DAYS * DAY_MS)
      ),
      projectIds: rule.projectIds,
      today: isoDate(now),
    }),
    dauRow
  );
  return evaluateDauDrop(
    rows[0]?.current_dau ?? 0,
    rows[0]?.baseline_dau ?? 0,
    rule.threshold
  );
};

export interface RunAlertsDeps {
  ch: ChClient;
  notifier: AlertNotifier;
  now: Date;
  cooldownMs?: number;
}

/**
 * Evaluate each resolved rule and deliver a notification when it fires and is
 * not within its cooldown. Returns one result per rule so the caller can
 * record `lastFiredAt` for the rules that actually notified.
 */
export const runAlerts = async (
  deps: RunAlertsDeps,
  rules: ResolvedAlertRule[]
): Promise<AlertRunResult[]> => {
  const cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const results: AlertRunResult[] = [];

  for (const rule of rules) {
    const verdict = await evaluateRule(deps.ch, rule, deps.now);
    let notified = false;

    if (verdict.fired) {
      const cooledDown =
        rule.lastFiredAt !== null &&
        deps.now.getTime() - rule.lastFiredAt.getTime() < cooldownMs;
      if (!cooledDown) {
        await deps.notifier.notify({
          channel: rule.channel,
          destination: rule.destination,
          firedAt: deps.now.toISOString(),
          metricLabel: METRIC_LABELS[rule.metric],
          ruleName: rule.name,
          scopeLabel: rule.scopeLabel,
          summary: verdict.summary,
        });
        notified = true;
      }
    }

    results.push({
      fired: verdict.fired,
      notified,
      ruleId: rule.id,
      summary: verdict.summary,
    });
  }

  return results;
};
