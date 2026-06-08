import type { Filter } from "@sbox-analytics/api/query-builder";
import { useQuery } from "@tanstack/react-query";
import type {
  UndefinedInitialDataOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import type { ColumnDef, Table } from "@tanstack/react-table";
import { useMemo } from "react";

import { useDataTable } from "@/hooks/use-data-table";
import { useQueryState } from "@/hooks/use-query-state";
import { getFiltersStateParser, getSortingStateParser } from "@/lib/parsers";
import { parseAsInteger, parseAsStringEnum } from "@/lib/query-params";
import type { JoinOperator } from "@/types/data-table";

import { toApiFilters } from "../lib/api-filters";

/**
 * The request shape the analytics endpoints share: a sort target, the
 * URL-persisted filters already translated to the wire format, the join
 * operator, and (for paginated routes) the current page window.
 */
export interface FetchedTableQueryParams<TSortBy extends string> {
  filters: Filter[] | undefined;
  joinOperator: JoinOperator;
  page: number;
  perPage: number;
  sortBy: TSortBy | undefined;
  sortDesc: boolean;
}

interface UseFetchedTableOptions<TRow, TSortBy extends string> {
  columns: ColumnDef<TRow, unknown>[];
  /**
   * URL-param prefix that namespaces this table's state (e.g. `"players"` →
   * `playersPage`, `playersSort`, …). Existing shared links depend on these
   * exact names, so each table keeps its historical prefix.
   */
  queryKeyPrefix: string;
  /**
   * Builds the oRPC query options from the resolved request params. The route
   * choice and any extra inputs (projectId/playerId/sessionId/from/to) are
   * closed over by the caller.
   */
  query: (
    params: FetchedTableQueryParams<TSortBy>
  ) => UndefinedInitialDataOptions<TRow[] | { rows: TRow[]; total: number }>;
  /** Default page size; matches each table's historical default. */
  defaultPerPage?: number;
  /** Default sort direction when no sort is set in the URL. */
  defaultSortDesc?: boolean;
  /**
   * Whether the backing route is paginated. Non-paginated routes (the events
   * breakdown) return a bare array, drive an infinite `pageCount`, and ignore
   * the page window.
   */
  paginated?: boolean;
}

const DEFAULT_PER_PAGE = 10;

const isPaginatedResult = <TRow>(
  data: TRow[] | { rows: TRow[]; total: number }
): data is { rows: TRow[]; total: number } => !Array.isArray(data);

/**
 * The repeated fetched-table pipeline every paginated analytics table shared:
 * stable parser creation, the five URL query-state reads, filter translation,
 * pagination math, and `useDataTable` wiring. Callers supply only the columns,
 * a key prefix, and a route-bound query builder.
 */
export const useFetchedTable = <TRow, TSortBy extends string = string>(
  options: UseFetchedTableOptions<TRow, TSortBy>
): {
  table: Table<TRow>;
  rows: TRow[];
  total: number;
  query: UseQueryResult<TRow[] | { rows: TRow[]; total: number }>;
  apiFilters: Filter[];
} => {
  const {
    columns,
    queryKeyPrefix,
    query: buildQuery,
    defaultPerPage = DEFAULT_PER_PAGE,
    defaultSortDesc = true,
    paginated = true,
  } = options;

  const keys = useMemo(
    () => ({
      filters: `${queryKeyPrefix}Filters`,
      joinOperator: `${queryKeyPrefix}JoinOperator`,
      page: `${queryKeyPrefix}Page`,
      perPage: `${queryKeyPrefix}PerPage`,
      sort: `${queryKeyPrefix}Sort`,
    }),
    [queryKeyPrefix]
  );

  // Stable parser references prevent useMemo/useQueryState invalidation on every
  // render; they only depend on the columns and the key prefix.
  const filterColumnIds = useMemo(
    () =>
      columns.flatMap((column) =>
        column.enableColumnFilter && column.id ? [column.id] : []
      ),
    [columns]
  );

  const filtersParser = useMemo(
    () => getFiltersStateParser<TRow>(filterColumnIds).withDefault([]),
    [filterColumnIds]
  );
  const sortingParser = useMemo(
    () => getSortingStateParser<TRow>().withDefault([]),
    []
  );
  const joinOperatorParser = useMemo(
    () => parseAsStringEnum(["and", "or"] as const).withDefault("and"),
    []
  );
  const pageParser = useMemo(() => parseAsInteger.withDefault(1), []);
  const perPageParser = useMemo(
    () => parseAsInteger.withDefault(defaultPerPage),
    [defaultPerPage]
  );

  const [page] = useQueryState(keys.page, pageParser);
  const [perPage] = useQueryState(keys.perPage, perPageParser);
  const [sorting] = useQueryState(keys.sort, sortingParser);
  const [tableFilters] = useQueryState(keys.filters, filtersParser);
  const [joinOperator] = useQueryState(keys.joinOperator, joinOperatorParser);

  const sortEntry = sorting[0] ?? null;
  const apiFilters = useMemo(() => toApiFilters(tableFilters), [tableFilters]);

  const query = useQuery(
    buildQuery({
      filters: apiFilters.length > 0 ? apiFilters : undefined,
      joinOperator,
      page,
      perPage,
      sortBy: (sortEntry?.id ?? undefined) as unknown as TSortBy | undefined,
      sortDesc: sortEntry?.desc ?? defaultSortDesc,
    })
  );

  const result = query.data;
  let rows: TRow[] = [];
  let total = 0;
  if (result) {
    if (isPaginatedResult(result)) {
      ({ rows } = result);
      ({ total } = result);
    } else {
      rows = result;
    }
  }

  const pageCount = paginated && perPage > 0 ? Math.ceil(total / perPage) : -1;

  const { table } = useDataTable({
    columns,
    data: rows,
    pageCount,
    queryKeys: keys,
  });

  return { apiFilters, query, rows, table, total };
};
