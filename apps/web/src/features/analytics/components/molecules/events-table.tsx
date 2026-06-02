import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ChartNoAxesColumn } from "lucide-react";
import { useMemo } from "react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableAdvancedToolbar } from "@/components/data-table/data-table-advanced-toolbar";
import { DataTableFilterList } from "@/components/data-table/data-table-filter-list";
import { DataTableSortList } from "@/components/data-table/data-table-sort-list";
import { TableSkeleton } from "@/components/table-skeleton";
import { useDataTable } from "@/hooks/use-data-table";
import { useQueryState } from "@/hooks/use-query-state";
import { getFiltersStateParser, getSortingStateParser } from "@/lib/parsers";
import { parseAsStringEnum } from "@/lib/query-params";
import { orpc } from "@/utils/orpc";

import { toApiFilters } from "../../lib/api-filters";

export interface EventRow {
  event_type: string;
  event_count: number;
  unique_players: number;
}

const COLUMN_IDS = ["event_type", "event_count", "unique_players"] as const;

const columns: ColumnDef<EventRow>[] = [
  {
    accessorKey: "event_type",
    enableColumnFilter: true,
    header: "Event",
    id: "event_type",
    meta: { label: "Event", variant: "text" },
  },
  {
    accessorKey: "event_count",
    enableColumnFilter: true,
    header: "Count",
    id: "event_count",
    meta: { label: "Count", variant: "number" },
  },
  {
    accessorKey: "unique_players",
    enableColumnFilter: true,
    header: "Unique players",
    id: "unique_players",
    meta: { label: "Unique players", variant: "number" },
  },
];

// Module-level parsers: stable references prevent useMemo invalidation on every render.
const filtersParser = getFiltersStateParser<EventRow>([
  ...COLUMN_IDS,
]).withDefault([]);
const joinOperatorParser = parseAsStringEnum([
  "and",
  "or",
] as const).withDefault("and");

export const EventsTable = ({
  from,
  projectId,
  to,
}: {
  from: string;
  projectId: string;
  to: string;
}) => {
  const [breakdownSort] = useQueryState(
    "breakdownSort",
    getSortingStateParser<EventRow>().withDefault([])
  );
  const sortEntry = breakdownSort[0] ?? null;

  const [breakdownFilters] = useQueryState("breakdownFilters", filtersParser);
  const [joinOperator] = useQueryState(
    "breakdownJoinOperator",
    joinOperatorParser
  );

  const apiFilters = useMemo(
    () => toApiFilters(breakdownFilters),
    [breakdownFilters]
  );

  const { data, isLoading } = useQuery(
    orpc.insights.breakdown.queryOptions({
      input: {
        filters: apiFilters.length > 0 ? apiFilters : undefined,
        from,
        joinOperator,
        projectId,
        sortBy: sortEntry?.id as
          | "event_type"
          | "event_count"
          | "unique_players"
          | undefined,
        sortDesc: sortEntry?.desc ?? true,
        to,
      },
    })
  );

  const rows = data ?? [];

  const { table } = useDataTable({
    columns,
    data: rows,
    pageCount: -1,
    queryKeys: {
      filters: "breakdownFilters",
      joinOperator: "breakdownJoinOperator",
      page: "breakdownPage",
      perPage: "breakdownPerPage",
      sort: "breakdownSort",
    },
  });

  if (isLoading) {
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
