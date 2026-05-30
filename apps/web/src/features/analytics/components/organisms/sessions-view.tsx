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

import { isoDaysAgo } from "../../lib/date-window";
import { buildHeatmapGrid } from "../../lib/heatmap";

const SESSIONS_WINDOW_DAYS = 30;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const SessionsView = ({ projectId }: { projectId: string }) => {
  const query = useQuery(
    orpc.insights.sessions.queryOptions({
      input: {
        from: isoDaysAgo(SESSIONS_WINDOW_DAYS),
        projectId,
        to: isoDaysAgo(0),
      },
    })
  );

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <Skeleton className="h-7 w-40" />
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
      <div>
        <h1 className="font-semibold text-2xl">Sessions</h1>
        <p className="text-muted-foreground">
          Last {SESSIONS_WINDOW_DAYS} days.
        </p>
      </div>

      {data.histogram.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">Session duration</h2>
          <ResponsiveContainer height={240} width="100%">
            <BarChart data={data.histogram}>
              <XAxis dataKey="bucket" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Bar dataKey="sessions" fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {data.trend.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">
            Avg session duration (seconds)
          </h2>
          <ResponsiveContainer height={240} width="100%">
            <LineChart data={data.trend}>
              <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Line
                dataKey="avg_seconds"
                dot={false}
                stroke="var(--primary)"
                type="monotone"
              />
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
