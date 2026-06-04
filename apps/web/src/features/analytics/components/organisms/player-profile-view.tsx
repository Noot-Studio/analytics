import { Badge } from "@sbox-analytics/ui/components/badge";
import { Bar } from "@sbox-analytics/ui/components/chart-series";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, UserSearch } from "lucide-react";
import { BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { orpc } from "@/utils/orpc";

import { PlayerAvatar } from "../atoms/player-avatar";
import { ActivityCalendar } from "../molecules/activity-calendar";
import { MetricCard } from "../molecules/metric-card";
import { PlayTimeHeatmap } from "../molecules/play-time-heatmap";
import { PlayerSessionsTable } from "../molecules/player-sessions-table";
import { PlayerSpecsCard } from "../molecules/player-specs-card";
import { ShareList } from "../molecules/share-list";
import type { ShareListItem } from "../molecules/share-list";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const TIMESTAMP_LENGTH = 19;
const PROPERTIES_PREVIEW_LENGTH = 120;
const PERCENT = 100;
const HISTOGRAM_HEIGHT = 200;

const formatTimestamp = (value: string) => value.slice(0, TIMESTAMP_LENGTH);

// Compact duration for stat values and playtime details: "1h 12m", "24m", "38s".
const formatPlaytime = (seconds: number) => {
  const hours = Math.floor(seconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const minutes = Math.floor(
    (seconds % (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)) / SECONDS_PER_MINUTE
  );
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % SECONDS_PER_MINUTE}s`;
  }
  return `${seconds}s`;
};

const RETENTION_DAYS = [
  { key: "retained_d1", label: "Day 1" },
  { key: "retained_d7", label: "Day 7" },
  { key: "retained_d30", label: "Day 30" },
] as const;

const Panel = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) => (
  <section className="rounded-lg border border-border p-4">
    <h2 className="mb-4 font-medium text-sm">{title}</h2>
    {children}
  </section>
);

export const PlayerProfileView = ({
  playerId,
  projectId,
}: {
  playerId: string;
  projectId: string;
}) => {
  const query = useQuery(
    orpc.insights.playerProfile.queryOptions({
      input: { playerId, projectId },
    })
  );

  const playersHref = `/dashboard/projects/${projectId}/players`;

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="p-4 text-destructive lg:p-6">
        Failed to load player profile.
      </div>
    );
  }

  const { data } = query;

  if (data.lifetime.total_events === 0) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <Link
          className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
          to={playersHref}
        >
          <ArrowLeft className="size-4" /> Back to players
        </Link>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserSearch />
            </EmptyMedia>
            <EmptyTitle>No events for this player</EmptyTitle>
            <EmptyDescription>
              We have no recorded activity for{" "}
              <code className="break-all">{playerId}</code>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const totalEvents = data.lifetime.total_events;
  const breakdownItems: ShareListItem[] = data.eventBreakdown.map((entry) => ({
    key: entry.event_type,
    label: entry.event_type,
    value: entry.count,
    valueLabel: `${entry.count.toLocaleString()} · ${((entry.count / totalEvents) * PERCENT).toFixed(1)}%`,
  }));

  const mapItems: ShareListItem[] = data.maps.map((entry) => ({
    detail: `${formatPlaytime(entry.playtime_seconds)} played`,
    key: entry.map || "(unknown)",
    label: entry.map || "(unknown)",
    value: entry.sessions,
    valueLabel: `${entry.sessions.toLocaleString()} ${entry.sessions === 1 ? "session" : "sessions"}`,
  }));

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-3">
        <Link
          className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
          to={playersHref}
        >
          <ArrowLeft className="size-4" /> Back to players
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <PlayerAvatar playerId={playerId} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="break-all font-mono font-semibold text-xl">
              {playerId}
            </h1>
            <p className="text-muted-foreground text-sm">
              First seen {formatTimestamp(data.lifetime.first_seen)} · last seen{" "}
              {formatTimestamp(data.lifetime.last_seen)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex flex-wrap gap-2">
              {RETENTION_DAYS.map((day) => (
                <Badge
                  key={day.key}
                  variant={data.retention[day.key] > 0 ? "default" : "outline"}
                >
                  {day.label}
                </Badge>
              ))}
            </div>
            {data.retention.cohort_date ? (
              <span className="text-muted-foreground text-xs">
                Cohort {data.retention.cohort_date.slice(0, 10)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total events" value={data.lifetime.total_events} />
        <MetricCard label="Sessions" value={data.lifetime.total_sessions} />
        <MetricCard label="Active days" value={data.lifetime.active_days} />
        <MetricCard
          label="Avg session"
          value={formatPlaytime(data.lifetime.avg_session_seconds)}
        />
        <MetricCard
          label="Total playtime"
          value={formatPlaytime(data.lifetime.total_playtime_seconds)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Activity (last 12 weeks)">
          <ActivityCalendar activity={data.activity} />
        </Panel>
        <Panel title="When they play">
          <PlayTimeHeatmap cells={data.hourGrid} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Event breakdown">
          <ShareList items={breakdownItems} />
        </Panel>
        <Panel title="Map distribution">
          <ShareList items={mapItems} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Hardware & client">
          {data.specs ? (
            <PlayerSpecsCard specs={data.specs} />
          ) : (
            <p className="text-muted-foreground text-sm">
              No hardware specs reported. Specs appear once the SDK sends them
              on session_start.
            </p>
          )}
        </Panel>
        <Panel title="Session length">
          <ResponsiveContainer height={HISTOGRAM_HEIGHT} width="100%">
            <BarChart data={data.durationHistogram}>
              <XAxis dataKey="bucket" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Bar dataKey="sessions" fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Session history">
        <PlayerSessionsTable playerId={playerId} projectId={projectId} />
      </Panel>

      <Panel title="Recent events">
        <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
          {data.timeline.map((event, index) => (
            <li
              className="flex flex-col gap-0.5 border-border border-b pb-2 last:border-b-0"
              key={`${event.timestamp}-${index}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{event.event_type}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
              {event.properties && event.properties !== "{}" ? (
                <code className="break-all text-muted-foreground text-xs">
                  {event.properties.slice(0, PROPERTIES_PREVIEW_LENGTH)}
                </code>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
};
