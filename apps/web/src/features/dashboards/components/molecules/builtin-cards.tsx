import { Area } from "@sbox-analytics/ui/components/chart-series";
import {
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MetricCard } from "@/features/analytics/components/molecules/metric-card";

import type { DailyMetricKey } from "../../lib/aggregate";
import { dailySeries, typeBreakdown } from "../../lib/aggregate";
import { useDailyMetric, useDailyRows } from "../../lib/card-data";
import type { CardRendererProps } from "../../lib/card-registry";

const CHART_HEIGHT = 240;

interface DailyMetricCardProps extends CardRendererProps {
  label: string;
  metric: DailyMetricKey;
}

const DailyMetricCard = ({ label, metric, ...props }: DailyMetricCardProps) => {
  const { trend, value } = useDailyMetric(props, metric);
  return <MetricCard label={label} trend={trend} value={value} />;
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
