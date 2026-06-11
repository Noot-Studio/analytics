import { z } from "zod";

import type { ChClient } from "./ch-client";
import { resultShape } from "./metrics";
import type { QueryConfig } from "./query-builder";
import { buildQuery } from "./query-builder";
import { runQuery } from "./run-query";

// The metric query path, concentrated. A merged query config (the metric's
// selector plus the consumer's view and scope) builds into one statement,
// executes across the ChClient seam, and its rows validate against a schema
// derived from the config's result shape. Every call site — the builder
// preview, a saved widget, a custom stat widget — used to repeat this inline;
// it now has one interface and one test surface.

// The builder always selects `value`; `time_bucket` joins it for a series, and
// `group_col_*` columns for groups (their count varies with `groupBy`). The row
// schema coerces `value` and lets the rest pass through, so the shape — not a
// hand-passed record schema — decides what's validated. `resultShape` reads
// only granularity + group-by, both present on the merged config.
const valueRow = z.looseObject({ value: z.coerce.number() });
const seriesRow = z.looseObject({
  time_bucket: z.string(),
  value: z.coerce.number(),
});

const rowSchema = (config: QueryConfig) => {
  switch (resultShape(config)) {
    case "series":
    case "grouped-series": {
      return seriesRow;
    }
    default: {
      return valueRow;
    }
  }
};

/**
 * Build, run, and validate a merged metric query, returning the rows plus the
 * generated SQL so the builder can show exactly what executed. The merge of a
 * metric config + view + scope happens at the call site (or in a router's input
 * schema); this owns build + run + the result-shape row schema.
 */
export const runMetric = async (
  ch: ChClient,
  config: QueryConfig
): Promise<{ rows: Record<string, unknown>[]; sql: string }> => {
  const built = buildQuery(config);
  const rows = await runQuery(ch, built, rowSchema(config));
  return { rows, sql: built.query };
};
