import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
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
import { SessionLink } from "../atoms/session-link";

const SECONDS_PER_MINUTE = 60;
const TIMESTAMP_LENGTH = 19;

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
  player_id: string;
  session_id: string;
  started_at: string;
}

const sessionColumns: ColumnDef<SessionRow, unknown>[] = [
  {
    accessorKey: "started_at",
    cell: ({ row }) => (
      <SessionLink sessionId={row.original.session_id}>
        {formatTimestamp(row.original.started_at)}
      </SessionLink>
    ),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Started" />
    ),
    id: "started_at",
  },
  {
    accessorKey: "player_id",
    cell: ({ row }) => <PlayerLink playerId={row.original.player_id} />,
    enableColumnFilter: true,
    enableSorting: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Player" />
    ),
    id: "player_id",
    meta: { label: "Player", variant: "text" },
  },
  {
    accessorKey: "map",
    cell: ({ row }) => row.original.map || "—",
    enableColumnFilter: true,
    enableSorting: false,
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

const SESSION_FILTER_COLUMN_IDS = [
  "player_id",
  "map",
  "duration_seconds",
  "event_count",
];

const sessionsFiltersParser = getFiltersStateParser<SessionRow>(
  SESSION_FILTER_COLUMN_IDS
).withDefault([]);
const sessionsJoinOperatorParser = parseAsStringEnum([
  "and",
  "or",
] as const).withDefault("and");

export const SessionsListTable = ({
  from,
  projectId,
  to,
}: {
  from: string;
  projectId: string;
  to: string;
}) => {
  const [page] = useQueryState("sessionsPage", parseAsInteger.withDefault(1));
  const [perPage] = useQueryState(
    "sessionsPerPage",
    parseAsInteger.withDefault(10)
  );
  const [sorting] = useQueryState(
    "sessionsSort",
    getSortingStateParser<SessionRow>().withDefault([])
  );
  const sortEntry = sorting[0] ?? null;
  const [tableFilters] = useQueryState(
    "sessionsFilters",
    sessionsFiltersParser
  );
  const [joinOperator] = useQueryState(
    "sessionsJoinOperator",
    sessionsJoinOperatorParser
  );
  const apiFilters = useMemo(() => toApiFilters(tableFilters), [tableFilters]);

  const query = useQuery(
    orpc.insights.sessionsList.queryOptions({
      input: {
        filters: apiFilters.length > 0 ? apiFilters : undefined,
        from,
        joinOperator,
        page,
        perPage,
        projectId,
        sortBy: sortEntry?.id,
        sortDesc: sortEntry?.desc ?? true,
        to,
      },
    })
  );

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = perPage > 0 ? Math.ceil(total / perPage) : -1;

  const { table } = useDataTable({
    columns: sessionColumns,
    data: rows,
    pageCount,
    queryKeys: {
      filters: "sessionsFilters",
      joinOperator: "sessionsJoinOperator",
      page: "sessionsPage",
      perPage: "sessionsPerPage",
      sort: "sessionsSort",
    },
  });

  return (
    <DataTable table={table}>
      <DataTableAdvancedToolbar table={table}>
        <DataTableFilterList table={table} />
        <DataTableSortList table={table} />
      </DataTableAdvancedToolbar>
    </DataTable>
  );
};
