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

const sessionsFiltersParser = getFiltersStateParser<SessionRow>([
  "started_at",
  "map",
  "duration_seconds",
  "event_count",
]).withDefault([]);
const sessionsJoinOperatorParser = parseAsStringEnum([
  "and",
  "or",
] as const).withDefault("and");

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
  const [page] = useQueryState("sessionsPage", parseAsInteger.withDefault(1));
  const [perPage] = useQueryState(
    "sessionsPerPage",
    parseAsInteger.withDefault(10)
  );
  const [sorting] = useQueryState(
    "sessionsSort",
    getSortingStateParser<SessionRow>().withDefault([])
  );
  const sortEntry = sorting[0] ?? null;
  const [tableFilters] = useQueryState(
    "sessionsFilters",
    sessionsFiltersParser
  );
  const [joinOperator] = useQueryState(
    "sessionsJoinOperator",
    sessionsJoinOperatorParser
  );
  const apiFilters = useMemo(() => toApiFilters(tableFilters), [tableFilters]);

  const query = useQuery(
    orpc.insights.playerSessions.queryOptions({
      input: {
        filters: apiFilters.length > 0 ? apiFilters : undefined,
        joinOperator,
        page,
        perPage,
        playerId,
        projectId,
        sortBy: sortEntry?.id as
          | "started_at"
          | "duration_seconds"
          | "event_count"
          | undefined,
        sortDesc: sortEntry?.desc ?? true,
      },
    })
  );

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = perPage > 0 ? Math.ceil(total / perPage) : -1;

  const { table } = useDataTable({
    columns: sessionColumns,
    data: rows,
    pageCount,
    queryKeys: {
      filters: "sessionsFilters",
      joinOperator: "sessionsJoinOperator",
      page: "sessionsPage",
      perPage: "sessionsPerPage",
      sort: "sessionsSort",
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
