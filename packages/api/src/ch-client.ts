import { clickhouse } from "./clickhouse";

// The seam between the analytics query path and ClickHouse. The only behaviour
// that varies between production and tests: execute one parameterized statement
// and hand back the raw result rows. Everything above this seam — zod parsing,
// parallel fan-out, pagination assembly (see ./run-query) — is pure and runs
// against any adapter, so a handler's orchestration is testable with the
// in-memory adapter in ./ch-client.fake.
export interface ChClient {
  query(sql: string, params: Record<string, unknown>): Promise<unknown[]>;
}

// Production adapter: the real ClickHouse HTTP client. Returns the JSON `data`
// array verbatim; callers validate it with their own row schema.
export const createChClient = (): ChClient => ({
  async query(sql, params) {
    const result = await clickhouse().query({
      format: "JSON",
      query: sql,
      query_params: params,
    });
    const json = await result.json<{ data: unknown[] }>();
    return json.data;
  },
});
