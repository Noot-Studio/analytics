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
import { RelativeTime } from "../atoms/relative-time";

interface PlayerRow {
  events: number;
  first_seen: string;
  last_seen: string;
  player_id: string;
  sessions: number;
}

const playerColumns: ColumnDef<PlayerRow, unknown>[] = [
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
    accessorKey: "sessions",
    cell: ({ row }) => row.original.sessions.toLocaleString(),
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Sessions" />
    ),
    id: "sessions",
    meta: { label: "Sessions", variant: "number" },
  },
  {
    accessorKey: "events",
    cell: ({ row }) => row.original.events.toLocaleString(),
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Events" />
    ),
    id: "events",
    meta: { label: "Events", variant: "number" },
  },
  {
    accessorKey: "last_seen",
    cell: ({ row }) => <RelativeTime date={row.original.last_seen} />,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Last seen" />
    ),
    id: "last_seen",
  },
];

export const PlayersListTable = ({
  from,
  projectId,
  to,
}: {
  from: string;
  projectId: string;
  to: string;
}) => {
  const { table } = useFetchedTable<PlayerRow>({
    columns: playerColumns,
    query: ({ filters, joinOperator, page, perPage, sortBy, sortDesc }) =>
      orpc.insights.playersList.queryOptions({
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
    queryKeyPrefix: "players",
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
