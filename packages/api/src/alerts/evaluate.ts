// Pure threshold evaluation for alert rules. No DB/network access — every
// function here is a plain input→output decision, so the firing logic is fully
// unit-testable without ClickHouse or a delivery channel.

// Mirrors the Prisma `AlertMetric` enum's string values.
export type AlertMetricName = "CrashSpike" | "DauDrop";

export interface CrashSpikeObservation {
  // Crash events counted in the lookback window.
  crashes: number;
}

export interface DauDropObservation {
  // Distinct players active so far in the current day.
  currentDau: number;
  // Baseline DAU the current day is compared against (e.g. trailing average).
  baselineDau: number;
}

// A breach describes why a rule fired — carried into the delivery payload so the
// notification can state the observed value alongside the configured threshold.
export interface AlertBreach {
  // The observed number that crossed the threshold (crash count, or drop %).
  value: number;
  threshold: number;
  summary: string;
}

const roundTenth = (value: number): number => Math.round(value * 10) / 10;

// Fires when the crash count in the window reaches the threshold.
export const evaluateCrashSpike = (
  threshold: number,
  observation: CrashSpikeObservation
): AlertBreach | null => {
  if (observation.crashes < threshold) {
    return null;
  }
  return {
    summary: `${observation.crashes} crashes in the last hour (threshold ${threshold}).`,
    threshold,
    value: observation.crashes,
  };
};

// Fires when the current day's DAU has fallen at least `threshold` percent below
// the baseline. With no baseline (a brand-new project) there is nothing to drop
// from, so the rule never fires.
export const evaluateDauDrop = (
  threshold: number,
  observation: DauDropObservation
): AlertBreach | null => {
  if (observation.baselineDau <= 0) {
    return null;
  }
  const dropPercent =
    ((observation.baselineDau - observation.currentDau) /
      observation.baselineDau) *
    100;
  if (dropPercent < threshold) {
    return null;
  }
  const rounded = roundTenth(dropPercent);
  return {
    summary: `DAU dropped ${rounded}% — ${observation.currentDau} today vs a ${observation.baselineDau} baseline (threshold ${threshold}%).`,
    threshold,
    value: rounded,
  };
};
