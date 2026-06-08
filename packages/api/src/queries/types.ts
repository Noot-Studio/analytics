// Shared shape for pure ClickHouse query builders. The router layer feeds the
// returned { query, params } into runQuery/runQueries/paginated (see ../run-query),
// which execute it across the ChClient seam and validate the rows.
export interface BuiltQuery {
  query: string;
  params: Record<string, unknown>;
}
