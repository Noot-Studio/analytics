import { Bar, Line } from "@sbox-analytics/ui/components/chart-series";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@sbox-analytics/ui/components/empty";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Activity } from "lucide-react";
import { useMemo } from "react";
import {
  BarChart,
  Legend,
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
import { parseAsStringEnum } from "@/lib/query-params";
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
const CRASH_RATE_PRECISION = 2;

const formatCrashRate = (value: number): string =>
  `${value.toFixed(CRASH_RATE_PRECISION)}%`;

const FPS_SERIES = [
  { key: "p50", label: "p50" },
  { key: "p95", label: "p95" },
  { key: "p99", label: "p99" },
];
const CRASH_SERIES = [{ key: "crash_rate", label: "Crash rate" }];
const LOAD_SERIES = [{ key: "count", label: "Sessions" }];

interface PerformanceMapRow {
  map: string;
  avg_fps: number;
  p95_fps: number;
  crashes: number;
}

const mapColumns: ColumnDef<PerformanceMapRow, unknown>[] = [
  {
    accessorKey: "map",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Map" />
    ),
    meta: { label: "Map", variant: "text" },
  },
  {
    accessorKey: "avg_fps",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Avg FPS" />
    ),
    meta: { label: "Avg FPS", variant: "number" },
  },
  {
    accessorKey: "p95_fps",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="p95 FPS" />
    ),
    meta: { label: "p95 FPS", variant: "number" },
  },
  {
    accessorKey: "crashes",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Crashes" />
    ),
    meta: { label: "Crashes", variant: "number" },
  },
];

const mapFiltersParser = getFiltersStateParser<PerformanceMapRow>([
  "map",
  "avg_fps",
  "p95_fps",
  "crashes",
]).withDefault([]);
const mapJoinOperatorParser = parseAsStringEnum([
  "and",
  "or",
] as const).withDefault("and");

const PerformanceByMapTable = ({ rows }: { rows: PerformanceMapRow[] }) => {
  const { table } = useDataTable({
    columns: mapColumns,
    data: rows,
    pageCount: -1,
    queryKeys: {
      filters: "mapFilters",
      joinOperator: "mapJoinOperator",
      page: "mapPage",
      perPage: "mapPerPage",
      sort: "mapSort",
    },
  });
  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="mb-4 font-medium text-sm">Performance by map</h2>
      <DataTable table={table}>
        <DataTableAdvancedToolbar table={table}>
          <DataTableFilterList table={table} />
          <DataTableSortList table={table} />
        </DataTableAdvancedToolbar>
      </DataTable>
    </div>
  );
};

const PerformanceCharts = ({
  crashes,
  fps,
  loadHistogram,
}: {
  crashes: { event_date: string; crash_rate: number }[];
  fps: { event_date: string; p50: number; p95: number; p99: number }[];
  loadHistogram: { bucket: string; count: number }[];
}) => {
  const fpsChart = useChartVisibility();
  const crashChart = useChartVisibility();
  const loadChart = useChartVisibility();

  return (
    <>
      <div className="rounded-lg border border-border p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-medium text-sm">Frame rate percentiles</h2>
          <ChartViewOptions
            hidden={fpsChart.hidden}
            onToggle={fpsChart.toggle}
            series={FPS_SERIES}
          />
        </div>
        <ResponsiveContainer height={240} width="100%">
          <LineChart data={fps}>
            <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
            <YAxis fontSize={12} tickLine={false} width={40} />
            <Tooltip />
            <Legend />
            {fpsChart.isVisible("p50") ? (
              <Line
                dataKey="p50"
                name="p50"
                stroke="var(--chart-1)"
                type="monotone"
              />
            ) : null}
            {fpsChart.isVisible("p95") ? (
              <Line
                dataKey="p95"
                name="p95"
                stroke="var(--chart-2)"
                type="monotone"
              />
            ) : null}
            {fpsChart.isVisible("p99") ? (
              <Line
                dataKey="p99"
                name="p99"
                stroke="var(--chart-3)"
                type="monotone"
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-medium text-sm">Crash rate over time</h2>
          <ChartViewOptions
            hidden={crashChart.hidden}
            onToggle={crashChart.toggle}
            series={CRASH_SERIES}
          />
        </div>
        <ResponsiveContainer height={240} width="100%">
          <LineChart data={crashes}>
            <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
            <YAxis fontSize={12} tickLine={false} width={40} />
            <Tooltip />
            {crashChart.isVisible("crash_rate") ? (
              <Line
                dataKey="crash_rate"
                name="Crash rate"
                stroke="var(--chart-4)"
                type="monotone"
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-medium text-sm">Load time distribution</h2>
          <ChartViewOptions
            hidden={loadChart.hidden}
            onToggle={loadChart.toggle}
            series={LOAD_SERIES}
          />
        </div>
        <ResponsiveContainer height={240} width="100%">
          <BarChart data={loadHistogram}>
            <XAxis dataKey="bucket" fontSize={12} tickLine={false} />
            <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
            <Tooltip />
            {loadChart.isVisible("count") ? (
              <Bar dataKey="count" fill="var(--primary)" />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export const PerformanceView = ({ projectId }: { projectId: string }) => {
  const { from, to } = useAnalyticsFilters();
  const [mapSort] = useQueryState(
    "mapSort",
    getSortingStateParser<PerformanceMapRow>().withDefault([])
  );
  const mapSortEntry = mapSort[0] ?? null;

  const [mapFilters] = useQueryState("mapFilters", mapFiltersParser);
  const [mapJoinOperator] = useQueryState(
    "mapJoinOperator",
    mapJoinOperatorParser
  );
  const apiMapFilters = useMemo(() => toApiFilters(mapFilters), [mapFilters]);

  const query = useQuery(
    orpc.insights.performance.queryOptions({
      input: {
        from: from.slice(0, 10),
        mapFilters: apiMapFilters.length > 0 ? apiMapFilters : undefined,
        mapJoinOperator,
        mapSortBy: mapSortEntry?.id as
          | "map"
          | "avg_fps"
          | "p95_fps"
          | "crashes"
          | undefined,
        mapSortDesc: mapSortEntry?.desc ?? false,
        projectId,
        to: to.slice(0, 10),
      },
    })
  );

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">
        Failed to load performance metrics.
      </div>
    );
  }

  const data = query.data ?? {
    byMap: [],
    crashes: [],
    fps: [],
    loadHistogram: [],
  };

  const hasData =
    data.fps.length > 0 ||
    data.crashes.length > 0 ||
    data.loadHistogram.length > 0 ||
    data.byMap.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-semibold text-2xl">Performance</h1>
          <TimeRangeFilter />
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Activity />
            </EmptyMedia>
            <EmptyTitle>No performance data yet</EmptyTitle>
            <EmptyDescription>
              Send <code>fps_sample</code>, <code>crash</code>, or{" "}
              <code>load_complete</code> events to populate this view.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const latestFps = data.fps.at(-1);
  const totalCrashes = data.crashes.reduce((sum, row) => sum + row.crashes, 0);
  const totalSessions = data.crashes.reduce(
    (sum, row) => sum + row.sessions,
    0
  );
  const crashRate =
    totalSessions > 0 ? (totalCrashes / totalSessions) * PERCENT : 0;

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl">Performance</h1>
        <TimeRangeFilter />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="FPS p50 (latest day)"
          value={latestFps ? latestFps.p50 : "—"}
        />
        <MetricCard
          label="FPS p95 (latest day)"
          value={latestFps ? latestFps.p95 : "—"}
        />
        <MetricCard
          format={formatCrashRate}
          label="Crash rate (per session)"
          value={crashRate}
        />
      </div>

      <PerformanceCharts
        crashes={data.crashes}
        fps={data.fps}
        loadHistogram={data.loadHistogram}
      />

      {data.byMap.length > 0 || apiMapFilters.length > 0 ? (
        <PerformanceByMapTable rows={data.byMap} />
      ) : null}
    </div>
  );
};
