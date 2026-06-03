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

const PLAYER_FILTER_COLUMN_IDS = ["player_id", "sessions", "events"];

const playersFiltersParser = getFiltersStateParser<PlayerRow>(
  PLAYER_FILTER_COLUMN_IDS
).withDefault([]);
const playersJoinOperatorParser = parseAsStringEnum([
  "and",
  "or",
] as const).withDefault("and");

export const PlayersListTable = ({
  from,
  projectId,
  to,
}: {
  from: string;
  projectId: string;
  to: string;
}) => {
  const [page] = useQueryState("playersPage", parseAsInteger.withDefault(1));
  const [perPage] = useQueryState(
    "playersPerPage",
    parseAsInteger.withDefault(10)
  );
  const [sorting] = useQueryState(
    "playersSort",
    getSortingStateParser<PlayerRow>().withDefault([])
  );
  const sortEntry = sorting[0] ?? null;
  const [tableFilters] = useQueryState("playersFilters", playersFiltersParser);
  const [joinOperator] = useQueryState(
    "playersJoinOperator",
    playersJoinOperatorParser
  );
  const apiFilters = useMemo(() => toApiFilters(tableFilters), [tableFilters]);

  const query = useQuery(
    orpc.insights.playersList.queryOptions({
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
    columns: playerColumns,
    data: rows,
    pageCount,
    queryKeys: {
      filters: "playersFilters",
      joinOperator: "playersJoinOperator",
      page: "playersPage",
      perPage: "playersPerPage",
      sort: "playersSort",
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
