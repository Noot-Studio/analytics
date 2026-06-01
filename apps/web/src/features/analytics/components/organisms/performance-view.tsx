import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import {
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";

import { isoDaysAgo } from "../../lib/date-window";
import { MetricCard } from "../molecules/metric-card";

const PERF_WINDOW_DAYS = 30;
const PERCENT = 100;
const CRASH_RATE_PRECISION = 2;

export const PerformanceView = ({ projectId }: { projectId: string }) => {
  const query = useQuery(
    orpc.insights.performance.queryOptions({
      input: {
        from: isoDaysAgo(PERF_WINDOW_DAYS),
        projectId,
        to: isoDaysAgo(0),
      },
    })
  );

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">
        Failed to load performance metrics.
      </div>
    );
  }

  const data = query.data ?? {
    byMap: [],
    crashes: [],
    fps: [],
    loadHistogram: [],
  };

  const hasData =
    data.fps.length > 0 ||
    data.crashes.length > 0 ||
    data.loadHistogram.length > 0 ||
    data.byMap.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <div>
          <h1 className="font-semibold text-2xl">Performance</h1>
          <p className="text-muted-foreground">Last {PERF_WINDOW_DAYS} days.</p>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Activity />
            </EmptyMedia>
            <EmptyTitle>No performance data yet</EmptyTitle>
            <EmptyDescription>
              Send <code>fps_sample</code>, <code>crash</code>, or{" "}
              <code>load_complete</code> events to populate this view.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const latestFps = data.fps.at(-1);
  const totalCrashes = data.crashes.reduce((sum, row) => sum + row.crashes, 0);
  const totalSessions = data.crashes.reduce(
    (sum, row) => sum + row.sessions,
    0
  );
  const crashRate =
    totalSessions > 0 ? (totalCrashes / totalSessions) * PERCENT : 0;

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="font-semibold text-2xl">Performance</h1>
        <p className="text-muted-foreground">Last {PERF_WINDOW_DAYS} days.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="FPS p50 (latest day)"
          value={latestFps ? latestFps.p50.toLocaleString() : "—"}
        />
        <MetricCard
          label="FPS p95 (latest day)"
          value={latestFps ? latestFps.p95.toLocaleString() : "—"}
        />
        <MetricCard
          label="Crash rate (per session)"
          value={`${crashRate.toFixed(CRASH_RATE_PRECISION)}%`}
        />
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-4 font-medium text-sm">Frame rate percentiles</h2>
        <ResponsiveContainer height={240} width="100%">
          <LineChart data={data.fps}>
            <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
            <YAxis fontSize={12} tickLine={false} width={40} />
            <Tooltip />
            <Legend />
            <Line
              dataKey="p50"
              name="p50"
              stroke="var(--chart-1)"
              type="monotone"
            />
            <Line
              dataKey="p95"
              name="p95"
              stroke="var(--chart-2)"
              type="monotone"
            />
            <Line
              dataKey="p99"
              name="p99"
              stroke="var(--chart-3)"
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-4 font-medium text-sm">Crash rate over time</h2>
        <ResponsiveContainer height={240} width="100%">
          <LineChart data={data.crashes}>
            <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
            <YAxis fontSize={12} tickLine={false} width={40} />
            <Tooltip />
            <Line
              dataKey="crash_rate"
              name="Crash rate"
              stroke="var(--chart-4)"
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-4 font-medium text-sm">Load time distribution</h2>
        <ResponsiveContainer height={240} width="100%">
          <BarChart data={data.loadHistogram}>
            <XAxis dataKey="bucket" fontSize={12} tickLine={false} />
            <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
            <Tooltip />
            <Bar dataKey="count" fill="var(--primary)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {data.byMap.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">Performance by map</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Map</th>
                <th className="py-2 text-right">Avg FPS</th>
                <th className="py-2 text-right">p95 FPS</th>
                <th className="py-2 text-right">Crashes</th>
              </tr>
            </thead>
            <tbody>
              {data.byMap.map((row) => (
                <tr className="border-b" key={row.map}>
                  <td className="py-2">{row.map}</td>
                  <td className="py-2 text-right tabular-nums">
                    {row.avg_fps.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {row.p95_fps.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {row.crashes.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
};
