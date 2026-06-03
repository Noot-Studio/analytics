import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableAdvancedToolbar } from "@/components/data-table/data-table-advanced-toolbar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFilterList } from "@/components/data-table/data-table-filter-list";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list";
import { useQueryState } from "@/hooks/use-query-state";
import { filterRows } from "@/lib/client-filter";
import { getFiltersStateParser } from "@/lib/parsers";
import { parseAsStringEnum } from "@/lib/query-params";

import { PlayerLink } from "../atoms/player-link";
import { SessionLink } from "../atoms/session-link";

export interface LiveEventRow {
  event_type: string;
  timestamp: string;
  session_id: string;
  player_id: string;
  properties: string;
}

const LIVE_PAGE_SIZE = 25;
const FILTERS_KEY = "liveFilters";
const JOIN_OPERATOR_KEY = "liveJoinOperator";

// Live events are filtered/sorted/paginated in-memory: the table tails a polled
// page of recent rows, so doing it client-side keeps the stream live without a
// round-trip per keystroke. The advanced filter expression is read from the URL
// (written by DataTableFilterList) and evaluated against the rows by filterRows.
const columns: ColumnDef<LiveEventRow>[] = [
  {
    accessorKey: "timestamp",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {row.original.timestamp}
      </span>
    ),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Time" />
    ),
    id: "timestamp",
    meta: { label: "Time", variant: "date" },
  },
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
    meta: { label: "Event", placeholder: "Filter events…", variant: "text" },
  },
  {
    accessorKey: "player_id",
    cell: ({ row }) => <PlayerLink playerId={row.original.player_id} />,
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Player" />
    ),
    id: "player_id",
    meta: { label: "Player", placeholder: "Filter players…", variant: "text" },
  },
  {
    accessorKey: "session_id",
    cell: ({ row }) => <SessionLink sessionId={row.original.session_id} />,
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Session" />
    ),
    id: "session_id",
    meta: {
      label: "Session",
      placeholder: "Filter sessions…",
      variant: "text",
    },
  },
];

const FILTER_COLUMN_IDS = columns.flatMap((column) =>
  column.id ? [column.id] : []
);

export const LiveEventsTable = ({ rows }: { rows: LiveEventRow[] }) => {
  const [filters] = useQueryState(
    FILTERS_KEY,
    getFiltersStateParser<LiveEventRow>(FILTER_COLUMN_IDS).withDefault([])
  );
  const [joinOperator] = useQueryState(
    JOIN_OPERATOR_KEY,
    parseAsStringEnum(["and", "or"] as const).withDefault("and")
  );

  const filteredRows = useMemo(
    () => filterRows(rows, filters, joinOperator),
    [rows, filters, joinOperator]
  );

  const table = useReactTable({
    columns,
    data: filteredRows,
    getCoreRowModel: getCoreRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: LIVE_PAGE_SIZE } },
    meta: {
      queryKeys: {
        filters: FILTERS_KEY,
        joinOperator: JOIN_OPERATOR_KEY,
        page: "livePage",
        perPage: "livePerPage",
        sort: "liveSort",
      },
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
