import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import type { ColumnDef } from "@tanstack/react-table";
import { ChartNoAxesColumn } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableAdvancedToolbar } from "@/components/data-table/data-table-advanced-toolbar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFilterList } from "@/components/data-table/data-table-filter-list";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list";
import { TableSkeleton } from "@/components/table-skeleton";
import { orpc } from "@/utils/orpc";

import { useFetchedTable } from "../../hooks/use-fetched-table";

export interface EventRow {
  event_type: string;
  event_count: number;
  unique_players: number;
}

type EventSortBy = "event_type" | "event_count" | "unique_players";

const columns: ColumnDef<EventRow, unknown>[] = [
  {
    accessorKey: "event_type",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Event" />
    ),
    id: "event_type",
    meta: { label: "Event", variant: "text" },
  },
  {
    accessorKey: "event_count",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Count" />
    ),
    id: "event_count",
    meta: { label: "Count", variant: "number" },
  },
  {
    accessorKey: "unique_players",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Unique players" />
    ),
    id: "unique_players",
    meta: { label: "Unique players", variant: "number" },
  },
];

export const EventsTable = ({
  from,
  projectId,
  to,
}: {
  from: string;
  projectId: string;
  to: string;
}) => {
  const { table, rows, query, apiFilters } = useFetchedTable<
    EventRow,
    EventSortBy
  >({
    columns,
    paginated: false,
    query: ({ filters, joinOperator, sortBy, sortDesc }) =>
      orpc.insights.breakdown.queryOptions({
        input: {
          filters,
          from,
          joinOperator,
          projectId,
          sortBy,
          sortDesc,
          to,
        },
      }),
    queryKeyPrefix: "breakdown",
  });

  if (query.isLoading) {
    return <TableSkeleton rows={6} />;
  }

  // Only short-circuit to the empty state when no filter is narrowing the set —
  // otherwise a filter that matches nothing would hide the toolbar used to clear it.
  if (apiFilters.length === 0 && rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartNoAxesColumn />
          </EmptyMedia>
          <EmptyTitle>No events in this window</EmptyTitle>
          <EmptyDescription>
            Send events from your game to see them here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <DataTable table={table}>
      <DataTableAdvancedToolbar table={table}>
        <DataTableFilterList table={table} />
        <DataTableSortList table={table} />
      </DataTableAdvancedToolbar>
    </DataTable>
  );
};
