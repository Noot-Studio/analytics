import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableAdvancedToolbar } from "@/components/data-table/data-table-advanced-toolbar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFilterList } from "@/components/data-table/data-table-filter-list";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list";
import { orpc } from "@/utils/orpc";

import { useFetchedTable } from "../../hooks/use-fetched-table";
import { SessionLink } from "../atoms/session-link";

const SECONDS_PER_MINUTE = 60;
const TIMESTAMP_LENGTH = 19;

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainder = seconds % SECONDS_PER_MINUTE;
  return `${minutes}m ${remainder}s`;
};

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
    cell: ({ row }) => (
      <SessionLink sessionId={row.original.session_id}>
        {row.original.started_at.slice(0, TIMESTAMP_LENGTH)}
      </SessionLink>
    ),
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

type PlayerSessionSortBy = "started_at" | "duration_seconds" | "event_count";

/**
 * Paginated session history for one player, backed by insights.playerSessions
 * so table interactions never refetch the profile's aggregate queries.
 */
export const PlayerSessionsTable = ({
  playerId,
  projectId,
}: {
  playerId: string;
  projectId: string;
}) => {
  const { table } = useFetchedTable<SessionRow, PlayerSessionSortBy>({
    columns: sessionColumns,
    query: ({ filters, joinOperator, page, perPage, sortBy, sortDesc }) =>
      orpc.insights.playerSessions.queryOptions({
        input: {
          filters,
          joinOperator,
          page,
          perPage,
          playerId,
          projectId,
          sortBy,
          sortDesc,
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
