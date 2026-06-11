// Pure threshold evaluation for a metric-backed alert. No DB/network — the
// runner feeds this the scalar it queried from ClickHouse and acts on the
// `fired` verdict. It also returns a human-readable `summary` so the delivered
// notification can describe exactly what tripped.
import type { AlertOperator } from "@sbox-analytics/db";

export interface AlertVerdict {
  fired: boolean;
  /** One-line description of the observation, for the notification body. */
  summary: string;
}

// Round to two decimals for display without affecting the comparison.
const forDisplay = (value: number): number => Math.round(value * 100) / 100;

/**
 * Compare a metric's scalar value against the threshold. `Above` fires at or
 * above the threshold; `Below` fires at or below it — so a rule fires exactly
 * when the value reaches the boundary it watches.
 */
export const evaluateThreshold = (
  value: number,
  operator: AlertOperator,
  threshold: number,
  metricName: string
): AlertVerdict => {
  const fired = operator === "Above" ? value >= threshold : value <= threshold;
  const comparator = operator === "Above" ? "≥" : "≤";
  return {
    fired,
    summary: `${metricName} is ${forDisplay(value)} (threshold ${comparator} ${threshold}).`,
  };
};
