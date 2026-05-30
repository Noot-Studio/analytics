import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon } from "lucide-react";
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

const MAPS_WINDOW_DAYS = 30;
const TOP_MAPS_FOR_TREND = 5;
const SECONDS_PER_MINUTE = 60;
const LINE_COLORS = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainder = seconds % SECONDS_PER_MINUTE;
  return `${minutes}m ${remainder}s`;
};

export const MapsView = ({ projectId }: { projectId: string }) => {
  const query = useQuery(
    orpc.insights.maps.queryOptions({
      input: {
        from: isoDaysAgo(MAPS_WINDOW_DAYS),
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
      <div className="p-4 text-destructive lg:p-6">Failed to load maps.</div>
    );
  }

  const data = query.data ?? { breakdown: [], overTime: [] };

  if (data.breakdown.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <div>
          <h1 className="font-semibold text-2xl">Maps &amp; Modes</h1>
          <p className="text-muted-foreground">Last {MAPS_WINDOW_DAYS} days.</p>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapIcon />
            </EmptyMedia>
            <EmptyTitle>No map data yet</EmptyTitle>
            <EmptyDescription>
              Send <code>session_start</code> events with a <code>map</code>{" "}
              property to populate this view.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const topMaps = data.breakdown
    .slice(0, TOP_MAPS_FOR_TREND)
    .map((row) => row.map);

  const trendByDate = new Map<string, Record<string, number | string>>();
  for (const row of data.overTime) {
    if (!topMaps.includes(row.map)) {
      continue;
    }
    const existing = trendByDate.get(row.event_date) ?? {
      event_date: row.event_date,
    };
    existing[row.map] = row.sessions;
    trendByDate.set(row.event_date, existing);
  }
  const trend = [...trendByDate.values()].toSorted((a, b) =>
    String(a.event_date).localeCompare(String(b.event_date))
  );

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="font-semibold text-2xl">Maps &amp; Modes</h1>
        <p className="text-muted-foreground">Last {MAPS_WINDOW_DAYS} days.</p>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-4 font-medium text-sm">Sessions per map</h2>
        <ResponsiveContainer height={240} width="100%">
          <BarChart data={data.breakdown}>
            <XAxis dataKey="map" fontSize={12} tickLine={false} />
            <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
            <Tooltip />
            <Bar dataKey="sessions" fill="var(--primary)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-3 font-medium text-sm">Map breakdown</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2 font-medium" scope="col">
                Map
              </th>
              <th className="pb-2 text-right font-medium" scope="col">
                Sessions
              </th>
              <th className="pb-2 text-right font-medium" scope="col">
                Players
              </th>
              <th className="pb-2 text-right font-medium" scope="col">
                Avg duration
              </th>
            </tr>
          </thead>
          <tbody>
            {data.breakdown.map((row) => (
              <tr className="border-border border-t" key={row.map}>
                <td className="py-2 font-medium">{row.map}</td>
                <td className="py-2 text-right tabular-nums">
                  {row.sessions.toLocaleString()}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {row.players.toLocaleString()}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatDuration(row.avg_seconds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {trend.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">
            Map popularity over time (top {TOP_MAPS_FOR_TREND})
          </h2>
          <ResponsiveContainer height={240} width="100%">
            <LineChart data={trend}>
              <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Legend />
              {topMaps.map((map, index) => (
                <Line
                  dataKey={map}
                  dot={false}
                  key={map}
                  stroke={LINE_COLORS[index % LINE_COLORS.length]}
                  type="monotone"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
};
