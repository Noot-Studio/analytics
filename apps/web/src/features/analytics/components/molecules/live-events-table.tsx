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

import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";

export interface LiveEventRow {
  event_type: string;
  timestamp: string;
  session_id: string;
  player_id: string;
  properties: string;
}

const LIVE_PAGE_SIZE = 25;

// Live events are filtered/sorted/paginated in-memory: the table tails a polled
// page of recent rows, so doing it client-side keeps the stream live without a
// round-trip per keystroke.
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
  },
  {
    accessorKey: "event_type",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.event_type}</span>
    ),
    enableColumnFilter: true,
    filterFn: "includesString",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Event" />
    ),
    id: "event_type",
    meta: { label: "Event", placeholder: "Filter events…", variant: "text" },
  },
  {
    accessorKey: "player_id",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.player_id}</span>
    ),
    enableColumnFilter: true,
    filterFn: "includesString",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Player" />
    ),
    id: "player_id",
    meta: { label: "Player", placeholder: "Filter players…", variant: "text" },
  },
  {
    accessorKey: "session_id",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.session_id}</span>
    ),
    enableColumnFilter: true,
    filterFn: "includesString",
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

export const LiveEventsTable = ({ rows }: { rows: LiveEventRow[] }) => {
  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { pagination: { pageIndex: 0, pageSize: LIVE_PAGE_SIZE } },
  });

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  );
};
