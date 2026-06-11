// Pure threshold evaluation for the two MVP alert metrics. No DB/network — the
// runner feeds these the numbers it queried from ClickHouse and acts on the
// `fired` verdict. Each function also returns a human-readable `summary` so the
// delivered notification can describe exactly what tripped.

export interface AlertVerdict {
  fired: boolean;
  /** One-line description of the observation, for the notification body. */
  summary: string;
}

/**
 * Crash spike: fires when the crash count over the window reaches the absolute
 * threshold. A threshold of 0 would fire on no crashes, so it's clamped to 1.
 */
export const evaluateCrashSpike = (
  crashes: number,
  threshold: number
): AlertVerdict => {
  const limit = Math.max(1, threshold);
  return {
    fired: crashes >= limit,
    summary: `${crashes} crash${crashes === 1 ? "" : "es"} in the last hour (threshold ${limit}).`,
  };
};

/**
 * DAU drop: fires when the day's active players fall at least `thresholdPct`
 * percent below the trailing-window average. With no baseline (a brand-new or
 * idle scope) there is nothing to drop from, so it never fires.
 */
export const evaluateDauDrop = (
  currentDau: number,
  baselineDau: number,
  thresholdPct: number
): AlertVerdict => {
  if (baselineDau <= 0) {
    return {
      fired: false,
      summary: "No baseline activity yet — DAU drop not evaluated.",
    };
  }
  const dropPct = ((baselineDau - currentDau) / baselineDau) * 100;
  const rounded = Math.round(dropPct * 10) / 10;
  return {
    fired: dropPct >= thresholdPct,
    summary: `DAU ${currentDau} is ${rounded}% below the ${Math.round(baselineDau)} average (threshold ${thresholdPct}%).`,
  };
};
