import { Area } from "@sbox-analytics/ui/components/chart-series";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MetricCard } from "@/features/analytics/components/molecules/metric-card";
import { orpc } from "@/utils/orpc";

import type { DailyMetricKey, DailyRow } from "../../lib/aggregate";
import {
  buildTrend,
  dailySeries,
  previousWindow,
  sumDaily,
  typeBreakdown,
} from "../../lib/aggregate";
import type { CardRendererProps } from "../../lib/card-registry";

const CHART_HEIGHT = 240;

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

/** Project-pinned cards read insights.daily; org-wide cards orgInsights.daily. */
const useDailyRows = ({
  config,
  from,
  organizationId,
  projectId,
  to,
}: CardRendererProps) => {
  const effectiveProjectId =
    projectId ?? (config as { projectId?: string }).projectId;
  const { data } = useSuspenseQuery(
    dailyQueryOptions(from, to, effectiveProjectId, organizationId)
  );
  return { effectiveProjectId, rows: data as DailyRow[] };
};

interface DailyMetricCardProps extends CardRendererProps {
  label: string;
  metric: DailyMetricKey;
}

const DailyMetricCard = (props: DailyMetricCardProps) => {
  const { effectiveProjectId, rows } = useDailyRows(props);

  // Preceding window of equal length, non-suspense so trends appear late
  // without blocking the card.
  const prev = previousWindow(props.from, props.to);
  const { data: prevRows } = useQuery(
    dailyQueryOptions(
      prev.from,
      prev.to,
      effectiveProjectId,
      props.organizationId
    )
  );

  const hasData = rows.length > 0;
  const total = sumDaily(rows, props.metric);
  const prevTotal = sumDaily((prevRows ?? []) as DailyRow[], props.metric);

  return (
    <MetricCard
      label={props.label}
      trend={hasData ? buildTrend(total, prevTotal) : undefined}
      value={hasData ? total : undefined}
    />
  );
};

export const MetricEventsCard = (props: CardRendererProps) => (
  <DailyMetricCard {...props} label="Total Events" metric="event_count" />
);

export const MetricPlayersCard = (props: CardRendererProps) => (
  <DailyMetricCard
    {...props}
    label="Unique Players (sum/day)"
    metric="unique_players"
  />
);

export const MetricSessionsCard = (props: CardRendererProps) => (
  <DailyMetricCard
    {...props}
    label="Sessions (sum/day)"
    metric="unique_sessions"
  />
);

const EmptyCardBody = ({ title }: { title: string }) => (
  <div className="flex h-full min-h-24 flex-col rounded-lg border border-border p-4">
    <h2 className="font-medium text-sm">{title}</h2>
    <p className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
      No data for this period.
    </p>
  </div>
);

export const EventsPerDayCard = (props: CardRendererProps) => {
  const { rows } = useDailyRows(props);
  const series = dailySeries(rows);

  if (series.length === 0) {
    return <EmptyCardBody title="Events per day" />;
  }

  return (
    <div className="h-full rounded-lg border border-border p-4">
      <h2 className="mb-4 font-medium text-sm">Events per day</h2>
      <ResponsiveContainer height={CHART_HEIGHT} width="100%">
        <AreaChart data={series}>
          <XAxis dataKey="date" fontSize={12} tickLine={false} />
          <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
          <Tooltip />
          <Area
            dataKey="events"
            fill="var(--primary)"
            fillOpacity={0.2}
            stroke="var(--primary)"
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const EventsByTypeCard = (props: CardRendererProps) => {
  const { rows } = useDailyRows(props);
  const types = typeBreakdown(rows);

  if (types.length === 0) {
    return <EmptyCardBody title="Events by type" />;
  }

  return (
    <div className="h-full rounded-lg border border-border p-4">
      <h2 className="mb-3 font-medium text-sm">Events by type</h2>
      <ul className="flex flex-col gap-2">
        {types.map((entry) => (
          <li
            className="flex items-center justify-between text-sm"
            key={entry.eventType}
          >
            <span className="font-medium">{entry.eventType}</span>
            <span className="text-muted-foreground tabular-nums">
              {entry.count.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
