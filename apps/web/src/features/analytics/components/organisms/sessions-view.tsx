import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";

import { buildHeatmapGrid } from "../../lib/heatmap";
import { useAnalyticsFilters } from "../../lib/use-analytics-filters";
import {
  ChartViewOptions,
  useChartVisibility,
} from "../molecules/chart-view-options";
import { TimeRangeFilter } from "../molecules/time-range-filter";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DURATION_SERIES = [{ key: "sessions", label: "Sessions" }];
const TREND_SERIES = [{ key: "avg_seconds", label: "Avg duration" }];

const SessionsHeader = () => (
  <div className="flex items-center justify-between gap-4">
    <h1 className="font-semibold text-2xl">Sessions</h1>
    <TimeRangeFilter />
  </div>
);

export const SessionsView = ({ projectId }: { projectId: string }) => {
  const { from, to } = useAnalyticsFilters();
  const durationChart = useChartVisibility();
  const trendChart = useChartVisibility();
  const query = useQuery(
    orpc.insights.sessions.queryOptions({
      input: {
        from: from.slice(0, 10),
        projectId,
        to: to.slice(0, 10),
      },
    })
  );

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <SessionsHeader />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">
        Failed to load sessions.
      </div>
    );
  }

  const data = query.data ?? { heatmap: [], histogram: [], trend: [] };
  const grid = buildHeatmapGrid(data.heatmap);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <SessionsHeader />

      {data.histogram.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="font-medium text-sm">Session duration</h2>
            <ChartViewOptions
              hidden={durationChart.hidden}
              onToggle={durationChart.toggle}
              series={DURATION_SERIES}
            />
          </div>
          <ResponsiveContainer height={240} width="100%">
            <BarChart data={data.histogram}>
              <XAxis dataKey="bucket" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              {durationChart.isVisible("sessions") ? (
                <Bar dataKey="sessions" fill="var(--primary)" />
              ) : null}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {data.trend.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="font-medium text-sm">
              Avg session duration (seconds)
            </h2>
            <ChartViewOptions
              hidden={trendChart.hidden}
              onToggle={trendChart.toggle}
              series={TREND_SERIES}
            />
          </div>
          <ResponsiveContainer height={240} width="100%">
            <LineChart data={data.trend}>
              <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              {trendChart.isVisible("avg_seconds") ? (
                <Line
                  dataKey="avg_seconds"
                  dot={false}
                  stroke="var(--primary)"
                  type="monotone"
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-4 font-medium text-sm">
          Activity by hour and weekday
        </h2>
        <div className="flex flex-col gap-1">
          {grid.rows.map((row, rowIndex) => (
            <div className="flex items-center gap-1" key={row.weekday}>
              <span className="w-8 text-muted-foreground text-xs">
                {WEEKDAY_LABELS[rowIndex]}
              </span>
              <div className="flex gap-0.5">
                {row.cells.map((count, hour) => (
                  <div
                    className="h-3 w-3 rounded-[2px]"
                    key={`${row.weekday}-${hour}`}
                    style={{
                      backgroundColor: "var(--primary)",
                      opacity:
                        grid.max > 0 ? 0.1 + (count / grid.max) * 0.9 : 0.1,
                    }}
                    title={`${WEEKDAY_LABELS[rowIndex]} ${hour}:00 — ${count} sessions`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
