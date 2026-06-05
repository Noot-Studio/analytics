import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableAdvancedToolbar } from "@/components/data-table/data-table-advanced-toolbar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFilterList } from "@/components/data-table/data-table-filter-list";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list";
import { orpc } from "@/utils/orpc";

import { useFetchedTable } from "../../hooks/use-fetched-table";
import { PlayerAvatar } from "../atoms/player-avatar";
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
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <PlayerAvatar playerId={row.original.player_id} />
        <PlayerLink playerId={row.original.player_id} />
      </div>
    ),
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

export const SessionsListTable = ({
  from,
  projectId,
  to,
}: {
  from: string;
  projectId: string;
  to: string;
}) => {
  const { table } = useFetchedTable<SessionRow>({
    columns: sessionColumns,
    query: ({ filters, joinOperator, page, perPage, sortBy, sortDesc }) =>
      orpc.insights.sessionsList.queryOptions({
        input: {
          filters,
          from,
          joinOperator,
          page,
          perPage,
          projectId,
          sortBy,
          sortDesc,
          to,
        },
      }),
    queryKeyPrefix: "sessions",
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
