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

import { orpc } from "@/utils/orpc";

import { MetricCard } from "../molecules/metric-card";

const SECONDS_PER_MINUTE = 60;
const TIMESTAMP_LENGTH = 19;
const PROPERTIES_PREVIEW_LENGTH = 120;

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainder = seconds % SECONDS_PER_MINUTE;
  return `${minutes}m ${remainder}s`;
};

const formatTimestamp = (value: string) => value.slice(0, TIMESTAMP_LENGTH);

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
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">
        Failed to load player profile.
      </div>
    );
  }

  const data = query.data ?? {
    lifetime: {
      active_days: 0,
      first_seen: "",
      last_seen: "",
      total_events: 0,
      total_sessions: 0,
    },
    sessions: [],
    timeline: [],
  };

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

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-1">
        <Link
          className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
          to={playersHref}
        >
          <ArrowLeft className="size-4" /> Back to players
        </Link>
        <h1 className="break-all font-semibold text-2xl">{playerId}</h1>
        <p className="text-muted-foreground">
          First seen {formatTimestamp(data.lifetime.first_seen)} · last seen{" "}
          {formatTimestamp(data.lifetime.last_seen)}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Total events"
          value={data.lifetime.total_events.toLocaleString()}
        />
        <MetricCard
          label="Sessions"
          value={data.lifetime.total_sessions.toLocaleString()}
        />
        <MetricCard
          label="Active days"
          value={data.lifetime.active_days.toLocaleString()}
        />
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-4 font-medium text-sm">Session history</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Started</th>
              <th className="py-2">Map</th>
              <th className="py-2 text-right">Duration</th>
              <th className="py-2 text-right">Events</th>
            </tr>
          </thead>
          <tbody>
            {data.sessions.map((row) => (
              <tr className="border-b" key={row.session_id}>
                <td className="py-2 tabular-nums">
                  {formatTimestamp(row.started_at)}
                </td>
                <td className="py-2">{row.map || "—"}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatDuration(row.duration_seconds)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {row.event_count.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-4 font-medium text-sm">Recent events</h2>
        <ul className="flex flex-col gap-2">
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
      </div>
    </div>
  );
};
