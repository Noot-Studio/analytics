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

const eventFiltersParser = getFiltersStateParser<SessionEvent>([
  "event_type",
]).withDefault([]);
const eventJoinOperatorParser = parseAsStringEnum([
  "and",
  "or",
] as const).withDefault("and");

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
  const [page] = useQueryState("eventsPage", parseAsInteger.withDefault(1));
  const [perPage] = useQueryState(
    "eventsPerPage",
    parseAsInteger.withDefault(20)
  );
  const [sorting] = useQueryState(
    "eventsSort",
    getSortingStateParser<SessionEvent>().withDefault([])
  );
  const sortEntry = sorting[0] ?? null;
  const [tableFilters] = useQueryState("eventsFilters", eventFiltersParser);
  const [joinOperator] = useQueryState(
    "eventsJoinOperator",
    eventJoinOperatorParser
  );
  const apiFilters = useMemo(() => toApiFilters(tableFilters), [tableFilters]);

  const query = useQuery(
    orpc.insights.sessionEvents.queryOptions({
      input: {
        filters: apiFilters.length > 0 ? apiFilters : undefined,
        joinOperator,
        page,
        perPage,
        projectId,
        sessionId,
        sortBy: sortEntry?.id,
        sortDesc: sortEntry?.desc ?? false,
      },
    })
  );

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = perPage > 0 ? Math.ceil(total / perPage) : -1;

  const { table } = useDataTable({
    columns: eventColumns,
    data: rows,
    pageCount,
    queryKeys: {
      filters: "eventsFilters",
      joinOperator: "eventsJoinOperator",
      page: "eventsPage",
      perPage: "eventsPerPage",
      sort: "eventsSort",
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
