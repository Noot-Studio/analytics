import { Area, Bar } from "@sbox-analytics/ui/components/chart-series";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import {
  AreaChart,
  BarChart,
  Legend,
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

const DAU_SERIES = [{ key: "dau", label: "Daily active" }];
const NEW_RETURNING_SERIES = [
  { key: "new_players", label: "New" },
  { key: "returning_players", label: "Returning" },
];

const PlayersHeader = () => (
  <div className="flex items-center justify-between gap-4">
    <h1 className="font-semibold text-2xl">Players</h1>
    <TimeRangeFilter />
  </div>
);

export const PlayersView = ({ projectId }: { projectId: string }) => {
  const { from, to } = useAnalyticsFilters();
  const dauChart = useChartVisibility();
  const newReturningChart = useChartVisibility();
  const query = useQuery(
    orpc.insights.players.queryOptions({
      input: {
        from: from.slice(0, 10),
        projectId,
        to: to.slice(0, 10),
      },
    })
  );

  if (query.isLoading) {
    const cardKeys = Array.from({ length: 2 }, (_, index) => `card-${index}`);
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <PlayersHeader />
        <div className="grid gap-4 md:grid-cols-2">
          {cardKeys.map((key) => (
            <Skeleton className="h-24 w-full" key={key} />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">Failed to load players.</div>
    );
  }

  const data = query.data ?? { daily: [], mau: 0, wau: 0 };

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <PlayersHeader />

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard label="WAU (last 7 days)" value={data.wau} />
        <MetricCard label="MAU (last 30 days)" value={data.mau} />
      </div>

      {data.daily.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>No player activity yet</EmptyTitle>
            <EmptyDescription>
              Player metrics will appear here once your game starts sending
              events.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {data.daily.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="font-medium text-sm">Daily active players</h2>
            <ChartViewOptions
              hidden={dauChart.hidden}
              onToggle={dauChart.toggle}
              series={DAU_SERIES}
            />
          </div>
          <ResponsiveContainer height={240} width="100%">
            <AreaChart data={data.daily}>
              <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              {dauChart.isVisible("dau") ? (
                <Area
                  dataKey="dau"
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

      {data.daily.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="font-medium text-sm">New vs returning</h2>
            <ChartViewOptions
              hidden={newReturningChart.hidden}
              onToggle={newReturningChart.toggle}
              series={NEW_RETURNING_SERIES}
            />
          </div>
          <ResponsiveContainer height={240} width="100%">
            <BarChart data={data.daily}>
              <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Legend />
              {newReturningChart.isVisible("new_players") ? (
                <Bar
                  dataKey="new_players"
                  fill="var(--primary)"
                  name="New"
                  stackId="p"
                />
              ) : null}
              {newReturningChart.isVisible("returning_players") ? (
                <Bar
                  dataKey="returning_players"
                  fill="var(--muted-foreground)"
                  name="Returning"
                  stackId="p"
                />
              ) : null}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
};
