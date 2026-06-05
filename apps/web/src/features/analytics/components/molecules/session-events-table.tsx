import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableAdvancedToolbar } from "@/components/data-table/data-table-advanced-toolbar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableFilterList } from "@/components/data-table/data-table-filter-list";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list";
import { orpc } from "@/utils/orpc";

import { useFetchedTable } from "../../hooks/use-fetched-table";
import { RelativeTime } from "../atoms/relative-time";

const PROPERTIES_PREVIEW_LENGTH = 120;

interface SessionEvent {
  event_type: string;
  properties: string;
  timestamp: string;
}

const eventColumns: ColumnDef<SessionEvent, unknown>[] = [
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
    meta: { label: "Event type", variant: "text" },
  },
  {
    accessorKey: "timestamp",
    cell: ({ row }) => <RelativeTime date={row.original.timestamp} />,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Time" />
    ),
    id: "timestamp",
  },
  {
    accessorKey: "properties",
    cell: ({ row }) =>
      row.original.properties && row.original.properties !== "{}" ? (
        <code className="break-all text-muted-foreground text-xs">
          {row.original.properties.slice(0, PROPERTIES_PREVIEW_LENGTH)}
        </code>
      ) : (
        "—"
      ),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Properties" />
    ),
    id: "properties",
  },
];

const EVENTS_PER_PAGE = 20;

/**
 * Paginated event log for one session, backed by insights.sessionEvents so
 * table interactions never refetch the profile's aggregate queries.
 */
export const SessionEventsTable = ({
  projectId,
  sessionId,
}: {
  projectId: string;
  sessionId: string;
}) => {
  const { table } = useFetchedTable<SessionEvent>({
    columns: eventColumns,
    defaultPerPage: EVENTS_PER_PAGE,
    defaultSortDesc: false,
    query: ({ filters, joinOperator, page, perPage, sortBy, sortDesc }) =>
      orpc.insights.sessionEvents.queryOptions({
        input: {
          filters,
          joinOperator,
          page,
          perPage,
          projectId,
          sessionId,
          sortBy,
          sortDesc,
        },
      }),
    queryKeyPrefix: "events",
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
