// Pure query construction for alert evaluation. No DB/network — fully unit-
// testable. An alert evaluates its saved metric as a single scalar over a
// trailing window across the rule's scope, so this merges the metric config
// with a scalar view (`granularity: "none"`, no group-by), the rule's project
// scope, and the window's time range into the shared query builder's input.
import type { AlertWindow } from "@sbox-analytics/db";

import type { MetricConfig } from "../metrics";
import type { QueryScope } from "../query-builder";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const WINDOW_MS: Record<AlertWindow, number> = {
  Last24Hours: DAY_MS,
  Last7Days: 7 * DAY_MS,
  LastHour: HOUR_MS,
};

export const windowMs = (window: AlertWindow): number => WINDOW_MS[window];

export interface AlertMetricQueryInput {
  config: MetricConfig;
  // Every project the rule covers (one for a project rule, all org projects).
  projectIds: string[];
  window: AlertWindow;
  // Evaluation instant; the window is the span ending here.
  now: Date;
}

// Build the scalar metric query for one rule: the metric measured over the
// window across the scope, with no time bucket or grouping so a single `value`
// comes back to compare against the threshold.
export const buildAlertMetricQuery = (
  input: AlertMetricQueryInput
): QueryScope => ({
  ...input.config,
  granularity: "none",
  limit: 1,
  projectId: input.projectIds,
  timeRange: {
    from: new Date(input.now.getTime() - windowMs(input.window)).toISOString(),
    to: input.now.toISOString(),
  },
});
