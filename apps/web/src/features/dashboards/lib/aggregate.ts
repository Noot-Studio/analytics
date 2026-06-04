import type { MetricTrend } from "@/features/analytics/components/molecules/metric-card";

/** Row shape shared by insights.daily and orgInsights.daily. */
export interface DailyRow {
  event_count: number;
  event_date: string;
  event_type: string;
  unique_players: number;
  unique_sessions: number;
}

export type DailyMetricKey =
  | "event_count"
  | "unique_players"
  | "unique_sessions";

const DAY_MS = 86_400_000;
const PERCENT = 100;
const TREND_EPSILON = 0.05;

const toDay = (iso: string) => iso.slice(0, 10);

export const buildTrend = (
  current: number,
  previous: number
): MetricTrend | undefined => {
  if (previous <= 0) {
    return;
  }
  const change = ((current - previous) / previous) * PERCENT;
  let direction: MetricTrend["direction"] = "neutral";
  if (change > TREND_EPSILON) {
    direction = "up";
  } else if (change < -TREND_EPSILON) {
    direction = "down";
  }
  const sign = change > 0 ? "+" : "";
  return {
    direction,
    label: `${sign}${change.toFixed(1)}% vs previous period`,
  };
};

export const sumDaily = (rows: DailyRow[], key: DailyMetricKey): number =>
  rows.reduce((sum, row) => sum + row[key], 0);

/** Preceding window of equal length, for period-over-period trends. */
export const previousWindow = (
  from: string,
  to: string
): { from: string; to: string } => {
  const fromMs = new Date(toDay(from)).getTime();
  const spanMs = new Date(toDay(to)).getTime() - fromMs;
  return {
    from: new Date(fromMs - DAY_MS - spanMs).toISOString().slice(0, 10),
    to: new Date(fromMs - DAY_MS).toISOString().slice(0, 10),
  };
};

export const dailySeries = (
  rows: DailyRow[]
): { date: string; events: number }[] => {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    byDate.set(
      row.event_date,
      (byDate.get(row.event_date) ?? 0) + row.event_count
    );
  }
  return [...byDate.entries()]
    .map(([date, events]) => ({ date, events }))
    .toSorted((a, b) => a.date.localeCompare(b.date));
};

export const typeBreakdown = (
  rows: DailyRow[]
): { count: number; eventType: string }[] => {
  const byType = new Map<string, number>();
  for (const row of rows) {
    byType.set(
      row.event_type,
      (byType.get(row.event_type) ?? 0) + row.event_count
    );
  }
  return [...byType.entries()]
    .map(([eventType, count]) => ({ count, eventType }))
    .toSorted((a, b) => b.count - a.count);
};
