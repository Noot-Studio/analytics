import { describe, expect, it } from "bun:test";

import { z } from "zod";

import { createFakeChClient } from "./ch-client.fake";
import type { BuiltQuery } from "./queries/types";
import { paginated, runQueries, runQuery } from "./run-query";

const row = z.object({ n: z.coerce.number(), name: z.string() });

const built = (
  query: string,
  params: Record<string, unknown> = {}
): BuiltQuery => ({
  params,
  query,
});

describe("runQuery", () => {
  it("validates and coerces the rows against the schema", async () => {
    const ch = createFakeChClient([
      { query: "Q", rows: [{ n: "7", name: "a" }] },
    ]);

    const rows = await runQuery(ch, built("Q"), row);

    expect(rows).toEqual([{ n: 7, name: "a" }]);
  });

  it("forwards the query and params across the seam", async () => {
    const ch = createFakeChClient([{ query: "Q", rows: [] }]);

    await runQuery(ch, built("Q", { projectId: "proj_1" }), row);

    expect(ch.calls).toEqual([{ params: { projectId: "proj_1" }, sql: "Q" }]);
  });

  it("throws when ClickHouse returns an unexpected shape", async () => {
    const ch = createFakeChClient([{ query: "Q", rows: [{ n: 1 }] }]);

    await expect(runQuery(ch, built("Q"), row)).rejects.toThrow();
  });
});

describe("runQueries", () => {
  it("fans out by name, each row set parsed by its own schema", async () => {
    // Canned responses are in the opposite order to the query map, proving the
    // fake disambiguates by SQL, not call order.
    const ch = createFakeChClient([
      { query: "COUNT", rows: [{ total: "3" }] },
      { query: "ROWS", rows: [{ n: "1", name: "x" }] },
    ]);

    const result = await runQueries(ch, {
      counts: {
        query: built("COUNT"),
        schema: z.object({ total: z.coerce.number() }),
      },
      items: { query: built("ROWS"), schema: row },
    });

    expect(result.items).toEqual([{ n: 1, name: "x" }]);
    expect(result.counts).toEqual([{ total: 3 }]);
  });
});

describe("paginated", () => {
  it("assembles { rows, total }, coercing the count", async () => {
    const ch = createFakeChClient([
      {
        query: "ROWS",
        rows: [
          { n: "1", name: "x" },
          { n: "2", name: "y" },
        ],
      },
      { query: "COUNT", rows: [{ total: "42" }] },
    ]);

    const result = await paginated(ch, built("ROWS"), built("COUNT"), row);

    expect(result).toEqual({
      rows: [
        { n: 1, name: "x" },
        { n: 2, name: "y" },
      ],
      total: 42,
    });
  });

  it("defaults total to 0 when the count query is empty", async () => {
    const ch = createFakeChClient([
      { query: "ROWS", rows: [] },
      { query: "COUNT", rows: [] },
    ]);

    const result = await paginated(ch, built("ROWS"), built("COUNT"), row);

    expect(result.total).toBe(0);
  });
});
