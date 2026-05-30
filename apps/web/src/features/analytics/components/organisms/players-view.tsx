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
  Area,
  AreaChart,
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";

import { isoDaysAgo } from "../../lib/date-window";
import { MetricCard } from "../molecules/metric-card";

const PLAYERS_WINDOW_DAYS = 30;

export const PlayersView = ({ projectId }: { projectId: string }) => {
  const query = useQuery(
    orpc.insights.players.queryOptions({
      input: {
        from: isoDaysAgo(PLAYERS_WINDOW_DAYS),
        projectId,
        to: isoDaysAgo(0),
      },
    })
  );

  if (query.isLoading) {
    const cardKeys = Array.from({ length: 2 }, (_, index) => `card-${index}`);
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
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
      <div>
        <h1 className="font-semibold text-2xl">Players</h1>
        <p className="text-muted-foreground">
          Last {PLAYERS_WINDOW_DAYS} days.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          label="WAU (last 7 days)"
          value={data.wau.toLocaleString()}
        />
        <MetricCard
          label="MAU (last 30 days)"
          value={data.mau.toLocaleString()}
        />
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
          <h2 className="mb-4 font-medium text-sm">Daily active players</h2>
          <ResponsiveContainer height={240} width="100%">
            <AreaChart data={data.daily}>
              <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Area
                dataKey="dau"
                fill="var(--primary)"
                fillOpacity={0.2}
                stroke="var(--primary)"
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {data.daily.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium text-sm">New vs returning</h2>
          <ResponsiveContainer height={240} width="100%">
            <BarChart data={data.daily}>
              <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="new_players"
                fill="var(--primary)"
                name="New"
                stackId="p"
              />
              <Bar
                dataKey="returning_players"
                fill="var(--muted-foreground)"
                name="Returning"
                stackId="p"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
};
