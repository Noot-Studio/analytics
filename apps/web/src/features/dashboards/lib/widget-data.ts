import type { CustomWidgetConfig } from "@sbox-analytics/api/dashboard-widgets";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

import type { MetricTrend } from "@/features/analytics/components/molecules/metric-card";
import { orpc } from "@/utils/orpc";

import type { DailyMetricKey, DailyRow } from "./aggregate";
import { buildTrend, previousWindow, sumDaily } from "./aggregate";
import type { WidgetRendererProps } from "./widget-registry";

/**
 * Resolve the project a widget reads from: an explicit dashboard binding wins,
 * otherwise the widget's own config pin (org overview widgets pin a project).
 */
const resolveProjectId = (props: WidgetRendererProps): string | undefined =>
  props.projectId ?? (props.config as { projectId?: string }).projectId;

const dailyQueryOptions = (
  from: string,
  to: string,
  projectId?: string,
  organizationId?: string
) => {
  const range = { from: from.slice(0, 10), to: to.slice(0, 10) };
  return projectId
    ? orpc.insights.daily.queryOptions({ input: { ...range, projectId } })
    : orpc.orgInsights.daily.queryOptions({
        input: { ...range, organizationId },
      });
};

/** Project-pinned widgets read insights.daily; org-wide widgets orgInsights.daily. */
export const useDailyRows = (props: WidgetRendererProps) => {
  const effectiveProjectId = resolveProjectId(props);
  const { data } = useSuspenseQuery(
    dailyQueryOptions(
      props.from,
      props.to,
      effectiveProjectId,
      props.organizationId
    )
  );
  return { effectiveProjectId, rows: data as DailyRow[] };
};

/**
 * Sum a daily metric over the current window and the preceding window of equal
 * length, returning the value and a period-over-period trend. The trend query
 * is non-suspense so it appears late without blocking the widget.
 */
export const useDailyMetric = (
  props: WidgetRendererProps,
  metric: DailyMetricKey
) => {
  const { effectiveProjectId, rows } = useDailyRows(props);

  const prev = previousWindow(props.from, props.to);
  const { data: prevRows } = useQuery(
    dailyQueryOptions(
      prev.from,
      prev.to,
      effectiveProjectId,
      props.organizationId
    )
  );

  if (rows.length === 0) {
    return { trend: undefined, value: undefined } as {
      trend: MetricTrend | undefined;
      value: number | undefined;
    };
  }

  const total = sumDaily(rows, metric);
  const prevTotal = sumDaily((prevRows ?? []) as DailyRow[], metric);
  return { trend: buildTrend(total, prevTotal), value: total };
};

/**
 * Run a custom stat widget's stored query for the current binding and time range.
 * Rows come back as { value, time_bucket?, group_col_N? } per the query-builder
 * aliases; ClickHouse JSON output serializes 64-bit aggregates as strings, so
 * numeric fields are coerced here.
 */
export const useCustomWidgetQuery = (
  config: CustomWidgetConfig,
  props: { from: string; projectId: string; to: string }
) => {
  const { data: rows } = useSuspenseQuery(
    orpc.customAnalytics.query.queryOptions({
      input: {
        ...config.query,
        projectId: props.projectId,
        timeRange: { from: props.from, to: props.to },
      },
    })
  );

  const metricValue = (() => {
    const raw = rows.at(0)?.value;
    return raw === null || raw === undefined ? undefined : Number(raw);
  })();

  const series = rows.map((row) => ({
    bucket: String(row.time_bucket ?? ""),
    value: Number(row.value ?? 0),
  }));

  return { metricValue, series };
};
