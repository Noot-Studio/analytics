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
import { ArrowLeft, UserSearch } from "lucide-react";
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

interface SessionRow {
  duration_seconds: number;
  ended_at: string;
  event_count: number;
  map: string;
  session_id: string;
  started_at: string;
}

const sessionColumns: ColumnDef<SessionRow, unknown>[] = [
  {
    accessorKey: "started_at",
    cell: ({ row }) => formatTimestamp(row.original.started_at),
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Started" />
    ),
    id: "started_at",
    meta: { label: "Started", variant: "text" },
  },
  {
    accessorKey: "map",
    cell: ({ row }) => row.original.map || "—",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Map" />
    ),
    id: "map",
    meta: { label: "Map", variant: "text" },
  },
  {
    accessorKey: "duration_seconds",
    cell: ({ row }) => formatDuration(row.original.duration_seconds),
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Duration" />
    ),
    id: "duration_seconds",
    meta: { label: "Duration", variant: "number" },
  },
  {
    accessorKey: "event_count",
    cell: ({ row }) => row.original.event_count.toLocaleString(),
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Events" />
    ),
    id: "event_count",
    meta: { label: "Events", variant: "number" },
  },
];

const sessionFiltersParser = getFiltersStateParser<SessionRow>([
  "started_at",
  "map",
  "duration_seconds",
  "event_count",
]).withDefault([]);
const sessionJoinOperatorParser = parseAsStringEnum([
  "and",
  "or",
] as const).withDefault("and");

export const PlayerProfileView = ({
  playerId,
  projectId,
}: {
  playerId: string;
  projectId: string;
}) => {
  const [sessionsPage] = useQueryState(
    "sessionsPage",
    parseAsInteger.withDefault(1)
  );
  const [sessionsPerPage] = useQueryState(
    "sessionsPerPage",
    parseAsInteger.withDefault(10)
  );
  const [sessionsSort] = useQueryState(
    "sessionsSort",
    getSortingStateParser<SessionRow>().withDefault([])
  );
  const [sessionsFilters] = useQueryState(
    "sessionsFilters",
    sessionFiltersParser
  );
  const [sessionsJoinOperator] = useQueryState(
    "sessionsJoinOperator",
    sessionJoinOperatorParser
  );
  const sessionsSortEntry = sessionsSort[0] ?? null;

  const apiSessionsFilters = useMemo(
    () => toApiFilters(sessionsFilters),
    [sessionsFilters]
  );

  const query = useQuery(
    orpc.insights.playerProfile.queryOptions({
      input: {
        playerId,
        projectId,
        sessionsFilters:
          apiSessionsFilters.length > 0 ? apiSessionsFilters : undefined,
        sessionsJoinOperator,
        sessionsPage,
        sessionsPerPage,
        sessionsSortBy: sessionsSortEntry?.id as
          | "started_at"
          | "duration_seconds"
          | "event_count"
          | undefined,
        sessionsSortDesc: sessionsSortEntry?.desc ?? true,
      },
    })
  );

  const sessionsTotal = query.data?.sessionsTotal ?? 0;
  const sessionsPageCount = Math.ceil(sessionsTotal / sessionsPerPage);
  const sessions = query.data?.sessions ?? [];

  const { table } = useDataTable({
    columns: sessionColumns,
    data: sessions,
    pageCount: sessionsPageCount,
    queryKeys: {
      filters: "sessionsFilters",
      joinOperator: "sessionsJoinOperator",
      page: "sessionsPage",
      perPage: "sessionsPerPage",
      sort: "sessionsSort",
    },
  });

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
    sessionsTotal: 0,
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
        <MetricCard label="Total events" value={data.lifetime.total_events} />
        <MetricCard label="Sessions" value={data.lifetime.total_sessions} />
        <MetricCard label="Active days" value={data.lifetime.active_days} />
      </div>

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-4 font-medium text-sm">Session history</h2>
        <DataTable table={table}>
          <DataTableAdvancedToolbar table={table}>
            <DataTableFilterList table={table} />
            <DataTableSortList table={table} />
          </DataTableAdvancedToolbar>
        </DataTable>
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
