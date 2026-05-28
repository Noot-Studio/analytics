import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";

import { MetricCard } from "../molecules/metric-card";

const OVERVIEW_WINDOW_DAYS = 30;

const dateInput = (daysAgo: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
};

export const OverviewView = ({ projectId }: { projectId: string }) => {
  const query = useQuery(
    orpc.analytics.daily.queryOptions({
      input: {
        from: dateInput(OVERVIEW_WINDOW_DAYS),
        projectId,
        to: dateInput(0),
      },
    })
  );

  if (query.isLoading) {
    return <div className="p-4 lg:p-6">Loading overview…</div>;
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">
        Failed to load analytics.
      </div>
    );
  }

  const rows = query.data ?? [];

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
      <div>
        <h1 className="font-semibold text-2xl">Overview</h1>
        <p className="text-muted-foreground">
          Last {OVERVIEW_WINDOW_DAYS} days.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground">
          No data yet — connect your SDK to start seeing events.
        </div>
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
          <h2 className="mb-4 font-medium text-sm">Events per day</h2>
          <ResponsiveContainer height={240} width="100%">
            <AreaChart data={trend}>
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
