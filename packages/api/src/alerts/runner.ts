// The alert evaluation pipeline: query -> evaluate -> deliver, with a cooldown.
// It depends only on the ChClient and AlertNotifier seams plus an injected
// clock, never on Prisma — the router loads the rules, expands their scope and
// metric config, and persists `lastFiredAt`. That keeps the whole pipeline
// testable end-to-end against in-memory fakes.
import type {
  AlertChannel,
  AlertOperator,
  AlertWindow,
} from "@sbox-analytics/db";

import type { ChClient } from "../ch-client";
import type { MetricConfig } from "../metrics";
import { runMetric } from "../run-metric";
import type { AlertNotifier } from "./delivery";
import { evaluateThreshold } from "./evaluate";
import { buildAlertMetricQuery } from "./queries";

const HOUR_MS = 60 * 60 * 1000;

// A sustained breach shouldn't re-notify on every check; suppress repeat
// notifications within this window of the last delivery.
export const DEFAULT_COOLDOWN_MS = HOUR_MS;

// A rule with its scope already expanded to the concrete project ids it covers
// (one for a project rule, every org project for an org rule) and its watched
// metric's config + name resolved.
export interface ResolvedAlertRule {
  id: string;
  name: string;
  metricConfig: MetricConfig;
  metricName: string;
  operator: AlertOperator;
  window: AlertWindow;
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

const evaluateRule = async (
  ch: ChClient,
  rule: ResolvedAlertRule,
  now: Date
): Promise<{ fired: boolean; summary: string }> => {
  const { rows } = await runMetric(
    ch,
    buildAlertMetricQuery({
      config: rule.metricConfig,
      now,
      projectIds: rule.projectIds,
      window: rule.window,
    })
  );
  const value = Number(rows[0]?.value ?? 0);
  return evaluateThreshold(
    value,
    rule.operator,
    rule.threshold,
    rule.metricName
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
          metricLabel: rule.metricName,
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
