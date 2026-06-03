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
import { Map as MapIcon } from "lucide-react";
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
import { parseAsInteger, parseAsStringEnum } from "@/lib/query-params";
import { orpc } from "@/utils/orpc";

import { toApiFilters } from "../../lib/api-filters";
import { useAnalyticsFilters } from "../../lib/use-analytics-filters";
import {
  ChartViewOptions,
  useChartVisibility,
} from "../molecules/chart-view-options";
import { TimeRangeFilter } from "../molecules/time-range-filter";

const TOP_MAPS_FOR_TREND = 5;
const SESSIONS_SERIES = [{ key: "sessions", label: "Sessions" }];
const SECONDS_PER_MINUTE = 60;
const LINE_COLORS = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const remainder = seconds % SECONDS_PER_MINUTE;
  return `${minutes}m ${remainder}s`;
};

interface MapRow {
  avg_seconds: number;
  map: string;
  players: number;
  sessions: number;
}

const MAP_COLUMN_IDS = ["map", "sessions", "players", "avg_seconds"] as const;
type MapSortColumn = (typeof MAP_COLUMN_IDS)[number];

const columns: ColumnDef<MapRow, unknown>[] = [
  {
    accessorKey: "map",
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Map" />
    ),
    id: "map",
    meta: { label: "Map", variant: "text" },
  },
  {
    accessorKey: "sessions",
    cell: ({ row }) => row.original.sessions.toLocaleString(),
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Sessions" />
    ),
    id: "sessions",
    meta: { label: "Sessions", variant: "number" },
  },
  {
    accessorKey: "players",
    cell: ({ row }) => row.original.players.toLocaleString(),
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Players" />
    ),
    id: "players",
    meta: { label: "Players", variant: "number" },
  },
  {
    accessorKey: "avg_seconds",
    cell: ({ row }) => formatDuration(row.original.avg_seconds),
    enableColumnFilter: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} label="Avg duration" />
    ),
    id: "avg_seconds",
    meta: { label: "Avg duration", variant: "number" },
  },
];

// Module-level parsers: stable references prevent useMemo invalidation on every render.
const mapFiltersParser = getFiltersStateParser<MapRow>([
  ...MAP_COLUMN_IDS,
]).withDefault([]);
const mapJoinOperatorParser = parseAsStringEnum([
  "and",
  "or",
] as const).withDefault("and");

const MapsHeader = () => (
  <div className="flex items-center justify-between gap-4">
    <h1 className="font-semibold text-2xl">Maps &amp; Modes</h1>
    <TimeRangeFilter />
  </div>
);

export const MapsView = ({ projectId }: { projectId: string }) => {
  const { from, to } = useAnalyticsFilters();
  const sessionsChart = useChartVisibility();
  const popularityChart = useChartVisibility();
  const fromDate = from.slice(0, 10);
  const toDate = to.slice(0, 10);

  const [page] = useQueryState("mapPage", parseAsInteger.withDefault(1));
  const [perPage] = useQueryState("mapPerPage", parseAsInteger.withDefault(10));
  const [sorting] = useQueryState(
    "mapSort",
    getSortingStateParser<MapRow>().withDefault([])
  );
  const sortEntry = sorting[0] ?? null;
  const [tableFilters] = useQueryState("mapFilters", mapFiltersParser);
  const [joinOperator] = useQueryState(
    "mapJoinOperator",
    mapJoinOperatorParser
  );

  const apiFilters = useMemo(() => toApiFilters(tableFilters), [tableFilters]);

  const query = useQuery(
    orpc.insights.maps.queryOptions({
      input: {
        filters: apiFilters.length > 0 ? apiFilters : undefined,
        from: fromDate,
        joinOperator,
        page,
        perPage,
        projectId,
        sortBy: sortEntry?.id as MapSortColumn | undefined,
        sortDesc: sortEntry?.desc ?? true,
        to: toDate,
      },
    })
  );

  const data = query.data ?? {
    breakdown: [],
    overTime: [],
    table: { rows: [], total: 0 },
  };
  const tableRows = data.table.rows;
  const pageCount = perPage > 0 ? Math.ceil(data.table.total / perPage) : -1;

  const { table } = useDataTable({
    columns,
    data: tableRows,
    pageCount,
    queryKeys: {
      filters: "mapFilters",
      joinOperator: "mapJoinOperator",
      page: "mapPage",
      perPage: "mapPerPage",
      sort: "mapSort",
    },
  });

  const topMaps = data.breakdown
    .slice(0, TOP_MAPS_FOR_TREND)
    .map((row) => row.map);
  const popularitySeries = topMaps.map((map) => ({ key: map, label: map }));

  const trendByDate = new Map<string, Record<string, number | string>>();
  for (const row of data.overTime) {
    if (!topMaps.includes(row.map)) {
      continue;
    }
    const existing = trendByDate.get(row.event_date) ?? {
      event_date: row.event_date,
    };
    existing[row.map] = row.sessions;
    trendByDate.set(row.event_date, existing);
  }
  const trend = [...trendByDate.values()].toSorted((a, b) =>
    String(a.event_date).localeCompare(String(b.event_date))
  );

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <MapsHeader />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-4 text-destructive lg:p-6">Failed to load maps.</div>
    );
  }

  // No data at all (and no filter narrowing it) — show the onboarding empty state.
  if (data.breakdown.length === 0 && apiFilters.length === 0) {
    return (
      <div className="flex flex-col gap-6 p-4 lg:p-6">
        <MapsHeader />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapIcon />
            </EmptyMedia>
            <EmptyTitle>No map data yet</EmptyTitle>
            <EmptyDescription>
              Send <code>session_start</code> events with a <code>map</code>{" "}
              property to populate this view.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <MapsHeader />

      {data.breakdown.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="font-medium text-sm">Sessions per map</h2>
            <ChartViewOptions
              hidden={sessionsChart.hidden}
              onToggle={sessionsChart.toggle}
              series={SESSIONS_SERIES}
            />
          </div>
          <ResponsiveContainer height={240} width="100%">
            <BarChart data={data.breakdown}>
              <XAxis dataKey="map" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              {sessionsChart.isVisible("sessions") ? (
                <Bar dataKey="sessions" fill="var(--primary)" />
              ) : null}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-4">
        <h2 className="mb-3 font-medium text-sm">Map breakdown</h2>
        <DataTable table={table}>
          <DataTableAdvancedToolbar table={table}>
            <DataTableFilterList table={table} />
            <DataTableSortList table={table} />
          </DataTableAdvancedToolbar>
        </DataTable>
      </div>

      {trend.length > 0 ? (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="font-medium text-sm">
              Map popularity over time (top {TOP_MAPS_FOR_TREND})
            </h2>
            <ChartViewOptions
              hidden={popularityChart.hidden}
              onToggle={popularityChart.toggle}
              series={popularitySeries}
            />
          </div>
          <ResponsiveContainer height={240} width="100%">
            <LineChart data={trend}>
              <XAxis dataKey="event_date" fontSize={12} tickLine={false} />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} />
              <Tooltip />
              <Legend />
              {topMaps.map((map, index) =>
                popularityChart.isVisible(map) ? (
                  <Line
                    dataKey={map}
                    dot={false}
                    key={map}
                    stroke={LINE_COLORS[index % LINE_COLORS.length]}
                    type="monotone"
                  />
                ) : null
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
};
