import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";

import { useAnalyticsFilters } from "../../lib/use-analytics-filters";
import {
  ChartViewOptions,
  useChartVisibility,
} from "../molecules/chart-view-options";
import { MetricCard } from "../molecules/metric-card";
import { TimeRangeFilter } from "../molecules/time-range-filter";

const TREND_SERIES = [{ key: "events", label: "Events" }];

export const OverviewView = ({ projectId }: { projectId: string }) => {
  const { from, to } = useAnalyticsFilters();
  const trendChart = useChartVisibility();
  // The route loader has already warmed this exact query, so useSuspenseQuery
  // resolves from cache on mount — no client-side loading branch. The loading
  // skeleton lives in the route's pendingComponent, errors in its errorComponent.
  const { data: rows } = useSuspenseQuery(
    orpc.insights.daily.queryOptions({
      input: {
        from: from.slice(0, 10),
        projectId,
        to: to.slice(0, 10),
      },
    })
  );

  const totalEvents = rows.reduce((sum, row) => sum + row.event_count, 0);
  const uniquePlayers = rows.reduce((sum, row) => sum + row.unique_players, 0);
  const sessions = rows.reduce((sum, row) => sum + row.unique_sessions, 0);

  const byDate = new Map<string, number>();
  for (const row of rows) {
    byDate.set(
      row.event_date,
      (byDate.get(row.event_date) ?? 0) + row.event_count
    );
  }
  const trend = [...byDate.entries()]
    .map(([date, events]) => ({ date, events }))
    .toSorted((a, b) => a.date.localeCompare(b.date));

  const byType = new Map<string, number>();
  for (const row of rows) {
    byType.set(
      row.event_type,
      (byType.get(row.event_type) ?? 0) + row.event_count
    );
  }
  const types = [...byType.entries()]
    .map(([eventType, count]) => ({ count, eventType }))
    .toSorted((a, b) => b.count - a.count);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl">Overview</h1>
        <TimeRangeFilter />
      </div>

      {rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Database />
            </EmptyMedia>
            <EmptyTitle>No data yet</EmptyTitle>
            <EmptyDescription>
              Connect your s&box SDK to start seeing events and player activity
              here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Events" value={totalEvents.toLocaleString()} />
        <MetricCard
          label="Unique Players (sum/day)"
          value={uniquePlayers.toLocaleString()}
        />
        <MetricCard
          label="Sessions (sum/day)"
          value={sessions.toLocaleString()}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard comingSoon label="Retention (D1/D7/D30)" />
        <MetricCard comingSoon label="Avg session duration" />
        <MetricCard comingSoon label="DAU over time" />
      </div>

      {trend.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="font-medium text-sm">Events per day</h2>
            <ChartViewOptions
              hidden={trendChart.hidden}
              onToggle={trendChart.toggle}
              series={TREND_SERIES}
            />
          </div>
          <ResponsiveContainer height={240} width="100%">
            <AreaChart data={trend}>
              <XAxis dataKey="date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              {trendChart.isVisible("events") ? (
                <Area
                  dataKey="events"
                  fill="var(--primary)"
                  fillOpacity={0.2}
                  stroke="var(--primary)"
                  type="monotone"
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {types.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
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
      ) : null}
    </div>
  );
};
