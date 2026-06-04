import { Badge } from "@sbox-analytics/ui/components/badge";
import { Line } from "@sbox-analytics/ui/components/chart-series";
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
import { ArrowLeft, SearchX } from "lucide-react";
import {
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { orpc } from "@/utils/orpc";

import { PlayerAvatar } from "../atoms/player-avatar";
import { PlayerLink } from "../atoms/player-link";
import { MetricCard } from "../molecules/metric-card";
import { PlayerSpecsCard } from "../molecules/player-specs-card";
import { SessionEventsTable } from "../molecules/session-events-table";
import { ShareList } from "../molecules/share-list";
import type { ShareListItem } from "../molecules/share-list";

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const TIMESTAMP_LENGTH = 19;
const PERCENT = 100;
const FPS_CHART_HEIGHT = 200;

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainder = seconds % SECONDS_PER_MINUTE;
  return `${minutes}m ${remainder}s`;
};

const formatTimestamp = (value: string) => value.slice(0, TIMESTAMP_LENGTH);

// X-axis tick for FPS samples: seconds since session start as "12m".
const formatOffset = (seconds: number) =>
  `${Math.floor(seconds / SECONDS_PER_MINUTE)}m`;

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

export const SessionProfileView = ({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) => {
  const query = useQuery(
    orpc.insights.sessionProfile.queryOptions({
      input: { projectId, sessionId },
    })
  );

  const sessionsHref = `/dashboard/projects/${projectId}/sessions`;

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
      <div className="p-4 text-destructive lg:p-6">Failed to load session.</div>
    );
  }

  const backLink = (
    <Link
      className="flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
      to={sessionsHref}
    >
      <ArrowLeft className="size-4" /> Back to sessions
    </Link>
  );

  const { data } = query;
  const { meta, perf } = data;

  if (meta.event_count === 0) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        {backLink}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No events for this session</EmptyTitle>
            <EmptyDescription>
              We have no recorded activity for{" "}
              <code className="break-all">{sessionId}</code>.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const breakdownItems: ShareListItem[] = data.eventBreakdown.map((entry) => ({
    key: entry.event_type,
    label: entry.event_type,
    value: entry.count,
    valueLabel: `${entry.count.toLocaleString()} · ${((entry.count / meta.event_count) * PERCENT).toFixed(1)}%`,
  }));

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-3">
        {backLink}
        <div className="flex flex-wrap items-center gap-4">
          <PlayerAvatar playerId={meta.player_id} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="break-all font-mono font-semibold text-xl">
              {sessionId}
            </h1>
            <p className="text-muted-foreground text-sm">
              Player <PlayerLink playerId={meta.player_id} /> ·{" "}
              {formatTimestamp(meta.started_at)} →{" "}
              {formatTimestamp(meta.ended_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {meta.map ? <Badge variant="outline">{meta.map}</Badge> : null}
            {data.specs?.platform ? (
              <Badge variant="outline">{data.specs.platform}</Badge>
            ) : null}
            {data.specs?.version ? (
              <Badge variant="outline">v{data.specs.version}</Badge>
            ) : null}
            {perf.crashes > 0 ? (
              <Badge variant="destructive">
                Crashed{perf.crash_reason ? ` · ${perf.crash_reason}` : ""}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          format={formatDuration}
          label="Duration"
          value={meta.duration_seconds}
        />
        <MetricCard label="Events" value={meta.event_count} />
        <MetricCard
          label="Avg FPS"
          value={perf.avg_fps > 0 ? perf.avg_fps : "—"}
        />
        <MetricCard label="Deaths" value={perf.deaths} />
        <MetricCard
          label="Load time"
          value={
            perf.load_ms > 0
              ? `${(perf.load_ms / MS_PER_SECOND).toFixed(1)}s`
              : "—"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="FPS during session">
          {data.fpsSeries.length > 0 ? (
            <>
              <ResponsiveContainer height={FPS_CHART_HEIGHT} width="100%">
                <LineChart data={data.fpsSeries}>
                  <XAxis
                    dataKey="offset_seconds"
                    fontSize={12}
                    tickFormatter={formatOffset}
                    tickLine={false}
                  />
                  <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
                  <Tooltip
                    labelFormatter={(value) =>
                      `${formatOffset(Number(value))} into session`
                    }
                  />
                  <Line
                    dataKey="fps"
                    dot={false}
                    stroke="var(--primary)"
                    type="monotone"
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="mt-2 text-muted-foreground text-xs">
                {perf.min_fps} min · {perf.avg_fps} avg · {perf.max_fps} max
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              No FPS samples recorded for this session.
            </p>
          )}
        </Panel>
        <Panel title="Event breakdown">
          <ShareList items={breakdownItems} />
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
      </div>

      <Panel title="Events">
        <SessionEventsTable projectId={projectId} sessionId={sessionId} />
      </Panel>
    </div>
  );
};
