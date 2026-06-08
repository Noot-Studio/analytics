import type { ChClient } from "./ch-client";

export interface FakeChClientCall {
  sql: string;
  params: Record<string, unknown>;
}

export interface FakeChClient extends ChClient {
  /** Every query the code under test issued, in order. */
  readonly calls: FakeChClientCall[];
}

// In-memory adapter for tests. Canned responses are keyed by the exact SQL a
// pure builder produces, so a test wires them by calling the same builder it is
// exercising — no hand-typed SQL, no coupling to query formatting. Matching is
// by SQL string, so a parallel batch disambiguates without relying on call
// order. An unmatched query throws, surfacing a missing fixture instead of
// silently returning nothing.
export const createFakeChClient = (
  responses: { query: string; rows: unknown[] }[]
): FakeChClient => {
  const calls: FakeChClientCall[] = [];
  return {
    calls,
    query(sql, params) {
      calls.push({ params, sql });
      const match = responses.find((response) => response.query === sql);
      if (!match) {
        throw new Error(
          `createFakeChClient: no canned response for query:\n${sql}`
        );
      }
      return Promise.resolve(match.rows);
    },
  };
};
