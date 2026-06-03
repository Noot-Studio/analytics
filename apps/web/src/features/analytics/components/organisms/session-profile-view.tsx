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
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, SearchX } from "lucide-react";
import { useMemo } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableAdvancedToolbar } from "@/components/data-table/data-table-advanced-toolbar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFilterList } from "@/components/data-table/data-table-filter-list";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list";
import { useDataTable } from "@/hooks/use-data-table";
import { useQueryState } from "@/hooks/use-query-state";
import { getFiltersStateParser, getSortingStateParser } from "@/lib/parsers";
import { parseAsInteger, parseAsStringEnum } from "@/lib/query-params";
import { orpc } from "@/utils/orpc";

import { toApiFilters } from "../../lib/api-filters";
import { PlayerLink } from "../atoms/player-link";
import { RelativeTime } from "../atoms/relative-time";
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

interface SessionEvent {
  event_type: string;
  properties: string;
  timestamp: string;
}

const eventColumns: ColumnDef<SessionEvent, unknown>[] = [
  {
    accessorKey: "event_type",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.event_type}</span>
    ),
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Event" />
    ),
    id: "event_type",
    meta: { label: "Event type", variant: "text" },
  },
  {
    accessorKey: "timestamp",
    cell: ({ row }) => <RelativeTime date={row.original.timestamp} />,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Time" />
    ),
    id: "timestamp",
  },
  {
    accessorKey: "properties",
    cell: ({ row }) =>
      row.original.properties && row.original.properties !== "{}" ? (
        <code className="break-all text-muted-foreground text-xs">
          {row.original.properties.slice(0, PROPERTIES_PREVIEW_LENGTH)}
        </code>
      ) : (
        "—"
      ),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Properties" />
    ),
    id: "properties",
  },
];

const eventFiltersParser = getFiltersStateParser<SessionEvent>([
  "event_type",
]).withDefault([]);
const eventJoinOperatorParser = parseAsStringEnum([
  "and",
  "or",
] as const).withDefault("and");

export const SessionProfileView = ({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) => {
  const [eventsPage] = useQueryState(
    "eventsPage",
    parseAsInteger.withDefault(1)
  );
  const [eventsPerPage] = useQueryState(
    "eventsPerPage",
    parseAsInteger.withDefault(20)
  );
  const [eventsSort] = useQueryState(
    "eventsSort",
    getSortingStateParser<SessionEvent>().withDefault([])
  );
  const [eventsFilters] = useQueryState("eventsFilters", eventFiltersParser);
  const [eventsJoinOperator] = useQueryState(
    "eventsJoinOperator",
    eventJoinOperatorParser
  );
  const eventsSortEntry = eventsSort[0] ?? null;

  const apiEventsFilters = useMemo(
    () => toApiFilters(eventsFilters),
    [eventsFilters]
  );

  const query = useQuery(
    orpc.insights.sessionProfile.queryOptions({
      input: {
        eventsFilters:
          apiEventsFilters.length > 0 ? apiEventsFilters : undefined,
        eventsJoinOperator,
        eventsPage,
        eventsPerPage,
        eventsSortBy: eventsSortEntry?.id,
        eventsSortDesc: eventsSortEntry?.desc ?? false,
        projectId,
        sessionId,
      },
    })
  );

  const eventsTotal = query.data?.eventsTotal ?? 0;
  const eventsPageCount = Math.ceil(eventsTotal / eventsPerPage);
  const events = query.data?.events ?? [];

  const { table } = useDataTable({
    columns: eventColumns,
    data: events,
    pageCount: eventsPageCount,
    queryKeys: {
      filters: "eventsFilters",
      joinOperator: "eventsJoinOperator",
      page: "eventsPage",
      perPage: "eventsPerPage",
      sort: "eventsSort",
    },
  });

  const sessionsHref = `/dashboard/projects/${projectId}/sessions`;

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

  const meta = query.data?.meta;

  if (!meta || meta.event_count === 0) {
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

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-1">
        {backLink}
        <h1 className="break-all font-semibold text-2xl">{sessionId}</h1>
        <p className="text-muted-foreground">
          Player <PlayerLink playerId={meta.player_id} /> ·{" "}
          {formatTimestamp(meta.started_at)} → {formatTimestamp(meta.ended_at)}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          format={formatDuration}
          label="Duration"
          value={meta.duration_seconds}
        />
        <MetricCard label="Events" value={meta.event_count} />
        <MetricCard label="Map" value={meta.map || "—"} />
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-4 font-medium text-sm">Events</h2>
        <DataTable table={table}>
          <DataTableAdvancedToolbar table={table}>
            <DataTableFilterList table={table} />
            <DataTableSortList table={table} />
          </DataTableAdvancedToolbar>
        </DataTable>
      </div>
    </div>
  );
};
