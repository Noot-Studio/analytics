import { Line } from "@sbox-analytics/ui/components/chart-series";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { IconUsersGroup } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import {
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
import { useAnalyticsFilters } from "../../lib/use-analytics-filters";
import {
  ChartViewOptions,
  useChartVisibility,
} from "../molecules/chart-view-options";
import { MetricCard } from "../molecules/metric-card";
import { TimeRangeFilter } from "../molecules/time-range-filter";

const PERCENT = 100;
const CHART_HEIGHT = 240;
const CURVE_SERIES = [{ key: "retention", label: "Retention" }];

const pct = (value: number, total: number): number =>
  total > 0 ? Math.round((value / total) * PERCENT) : 0;

const formatPercent = (value: number): string => `${Math.round(value)}%`;

interface CohortRow {
  cohort_date: string;
  d1: number;
  d30: number;
  d7: number;
  size: number;
}

const COHORT_COLUMN_IDS = ["cohort_date", "size", "d1", "d7", "d30"] as const;
type CohortSortColumn = (typeof COHORT_COLUMN_IDS)[number];

const columns: ColumnDef<CohortRow, unknown>[] = [
  {
    accessorKey: "cohort_date",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Cohort" />
    ),
    id: "cohort_date",
    meta: { label: "Cohort", variant: "text" },
  },
  {
    accessorKey: "size",
    cell: ({ row }) => row.original.size.toLocaleString(),
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Players" />
    ),
    id: "size",
    meta: { label: "Players", variant: "number" },
  },
  {
    accessorKey: "d1",
    cell: ({ row }) => `${row.original.d1}%`,
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Day 1" />
    ),
    id: "d1",
    meta: { label: "Day 1 %", variant: "number" },
  },
  {
    accessorKey: "d7",
    cell: ({ row }) => `${row.original.d7}%`,
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Day 7" />
    ),
    id: "d7",
    meta: { label: "Day 7 %", variant: "number" },
  },
  {
    accessorKey: "d30",
    cell: ({ row }) => `${row.original.d30}%`,
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Day 30" />
    ),
    id: "d30",
    meta: { label: "Day 30 %", variant: "number" },
  },
];

// Module-level parsers: stable references prevent useMemo invalidation on every render.
const cohortFiltersParser = getFiltersStateParser<CohortRow>([
  ...COHORT_COLUMN_IDS,
]).withDefault([]);
const cohortJoinOperatorParser = parseAsStringEnum([
  "and",
  "or",
] as const).withDefault("and");

const RetentionHeader = () => (
  <div className="flex items-center justify-between gap-4">
    <div className="flex flex-col gap-1">
      <h1 className="font-semibold text-2xl">Retention</h1>
      <p className="text-muted-foreground text-sm">
        Cohort retention over the selected range.
      </p>
    </div>
    <TimeRangeFilter />
  </div>
);

export const RetentionView = ({ projectId }: { projectId: string }) => {
  const { from, to } = useAnalyticsFilters();
  const curveChart = useChartVisibility();

  const [page] = useQueryState("cohortPage", parseAsInteger.withDefault(1));
  const [perPage] = useQueryState(
    "cohortPerPage",
    parseAsInteger.withDefault(10)
  );
  const [sorting] = useQueryState(
    "cohortSort",
    getSortingStateParser<CohortRow>().withDefault([])
  );
  const sortEntry = sorting[0] ?? null;
  const [tableFilters] = useQueryState("cohortFilters", cohortFiltersParser);
  const [joinOperator] = useQueryState(
    "cohortJoinOperator",
    cohortJoinOperatorParser
  );

  const apiFilters = useMemo(() => toApiFilters(tableFilters), [tableFilters]);

  const query = useQuery(
    orpc.insights.retention.queryOptions({
      input: {
        filters: apiFilters.length > 0 ? apiFilters : undefined,
        from: from.slice(0, 10),
        joinOperator,
        page,
        perPage,
        projectId,
        sortBy: sortEntry?.id as CohortSortColumn | undefined,
        sortDesc: sortEntry?.desc ?? true,
        to: to.slice(0, 10),
      },
    })
  );

  const data = query.data ?? { curve: [], table: { rows: [], total: 0 } };
  const pageCount = perPage > 0 ? Math.ceil(data.table.total / perPage) : -1;

  const { table } = useDataTable({
    columns,
    data: data.table.rows,
    pageCount,
    queryKeys: {
      filters: "cohortFilters",
      joinOperator: "cohortJoinOperator",
      page: "cohortPage",
      perPage: "cohortPerPage",
      sort: "cohortSort",
    },
  });

  const base = data.curve.find((row) => row.day_offset === 0)?.retained ?? 0;
  const retainedAt = (offset: number): number =>
    data.curve.find((row) => row.day_offset === offset)?.retained ?? 0;
  const curve = data.curve.map((row) => ({
    day: row.day_offset,
    retention: pct(row.retained, base),
  }));

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <RetentionHeader />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">
        Failed to load retention.
      </div>
    );
  }

  // Nothing to show and no filter narrowing it — onboarding empty state.
  if (
    data.curve.length === 0 &&
    data.table.total === 0 &&
    apiFilters.length === 0
  ) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <RetentionHeader />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconUsersGroup />
            </EmptyMedia>
            <EmptyTitle>No cohorts yet</EmptyTitle>
            <EmptyDescription>
              Retention appears once players return across multiple days.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <RetentionHeader />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          format={formatPercent}
          label="Day-1 retention"
          value={pct(retainedAt(1), base)}
        />
        <MetricCard
          format={formatPercent}
          label="Day-7 retention"
          value={pct(retainedAt(7), base)}
        />
        <MetricCard
          format={formatPercent}
          label="Day-30 retention"
          value={pct(retainedAt(30), base)}
        />
      </div>

      {curve.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="font-medium text-sm">
              Average retention curve (mature cohorts)
            </h2>
            <ChartViewOptions
              hidden={curveChart.hidden}
              onToggle={curveChart.toggle}
              series={CURVE_SERIES}
            />
          </div>
          <ResponsiveContainer height={CHART_HEIGHT} width="100%">
            <LineChart data={curve}>
              <XAxis dataKey="day" fontSize={12} tickLine={false} />
              <YAxis fontSize={12} tickLine={false} unit="%" />
              <Tooltip formatter={(value) => `${value}%`} />
              {curveChart.isVisible("retention") ? (
                <Line
                  dataKey="retention"
                  dot={false}
                  name="Retention"
                  stroke="var(--primary)"
                  type="monotone"
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-3 font-medium text-sm">Cohorts</h2>
        <DataTable table={table}>
          <DataTableAdvancedToolbar table={table}>
            <DataTableFilterList table={table} />
            <DataTableSortList table={table} />
          </DataTableAdvancedToolbar>
        </DataTable>
      </div>
    </div>
  );
};
