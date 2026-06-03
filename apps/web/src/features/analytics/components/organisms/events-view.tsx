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
import { parseAsInteger } from "@/lib/query-params";
import { orpc } from "@/utils/orpc";

import { toApiFilters } from "../../lib/api-filters";
import { useAnalyticsFilters } from "../../lib/use-analytics-filters";
import { RelativeTime } from "../atoms/relative-time";
import { EventsTable } from "../molecules/events-table";
import { TimeRangeFilter } from "../molecules/time-range-filter";

interface RecentEvent {
  event_type: string;
  timestamp: string;
  session_id: string;
  player_id: string;
  properties: string;
}

const recentColumns: ColumnDef<RecentEvent, unknown>[] = [
  {
    accessorKey: "event_type",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Event" />
    ),
    id: "event_type",
    meta: { label: "Event type", variant: "select" },
  },
  {
    accessorKey: "player_id",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Player" />
    ),
    id: "player_id",
    meta: { label: "Player", variant: "text" },
  },
  {
    accessorKey: "session_id",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Session" />
    ),
    id: "session_id",
    meta: { label: "Session", variant: "text" },
  },
  {
    accessorKey: "timestamp",
    cell: ({ row }) => <RelativeTime date={row.original.timestamp} />,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Time" />
    ),
    id: "timestamp",
  },
];

const RECENT_COLUMN_IDS = ["event_type", "player_id", "session_id"];

// Module-level parser: stable reference prevents useMemo invalidation on every render.
const tableFiltersParser = getFiltersStateParser<RecentEvent>(
  RECENT_COLUMN_IDS
).withDefault([]);

export const EventsView = ({ projectId }: { projectId: string }) => {
  const { from, to } = useAnalyticsFilters();
  // The breakdown rollup is keyed by day; raw events use full datetime bounds.
  const fromDate = from.slice(0, 10);
  const toDate = to.slice(0, 10);

  const [page] = useQueryState("page", parseAsInteger.withDefault(1));
  const [perPage] = useQueryState("perPage", parseAsInteger.withDefault(10));
  const [sorting] = useQueryState(
    "sort",
    getSortingStateParser<RecentEvent>().withDefault([])
  );
  const sortEntry = sorting[0] ?? null;

  const [tableFilters] = useQueryState("tableFilters", tableFiltersParser);

  const apiFilters = useMemo(() => toApiFilters(tableFilters), [tableFilters]);

  const recent = useQuery(
    orpc.insights.recent.queryOptions({
      input: {
        filters: apiFilters.length > 0 ? apiFilters : undefined,
        from,
        page,
        perPage,
        projectId,
        sortBy: sortEntry?.id,
        sortDesc: sortEntry?.desc ?? false,
        to,
      },
    })
  );

  const recentRows = recent.data?.rows ?? [];
  const total = recent.data?.total ?? 0;
  const pageCount = perPage > 0 ? Math.ceil(total / perPage) : -1;

  const { table } = useDataTable({
    columns: recentColumns,
    data: recentRows,
    pageCount,
    queryKeys: { filters: "tableFilters" },
  });

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg">Events</h2>
          <p className="text-muted-foreground text-sm">
            Event totals by type and the raw event stream.
          </p>
        </div>
        <TimeRangeFilter />
      </div>

      <EventsTable from={fromDate} projectId={projectId} to={toDate} />

      <DataTable table={table}>
        <DataTableAdvancedToolbar table={table}>
          <DataTableFilterList table={table} />
          <DataTableSortList table={table} />
        </DataTableAdvancedToolbar>
      </DataTable>
    </div>
  );
};
