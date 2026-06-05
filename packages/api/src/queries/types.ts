// Shared shape for pure ClickHouse query builders. The router layer feeds the
// returned { query, params } straight into clickhouse().query({ query_params: params }).
export interface BuiltQuery {
  query: string;
  params: Record<string, unknown>;
}
