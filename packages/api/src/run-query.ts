import { z } from "zod";

import type { ChClient } from "./ch-client";
import type { BuiltQuery } from "./queries/types";

// The query path, deepened. These three functions sit above the ChClient seam
// and own everything the analytics handlers used to repeat inline: executing a
// built query, decoding the rows, and validating them against a row schema.
// The row schema is named once — it is the return type.

/** Run one built query and validate its rows against `schema`. */
export async function runQuery<T extends z.ZodTypeAny>(
  ch: ChClient,
  built: BuiltQuery,
  schema: T
): Promise<z.infer<T>[]> {
  const rows = await ch.query(built.query, built.params);
  return z.array(schema).parse(rows);
}

export interface NamedQuery<T extends z.ZodTypeAny> {
  query: BuiltQuery;
  schema: T;
}

/**
 * Fan a named set of queries out in parallel, each validated by its own row
 * schema. Keys name the queries at the call site, so a handler never juggles a
 * positional `Promise.all` and the result is a typed record.
 */
export async function runQueries<
  M extends Record<string, NamedQuery<z.ZodTypeAny>>,
>(
  ch: ChClient,
  queries: M
): Promise<{ [K in keyof M]: z.infer<M[K]["schema"]>[] }> {
  const settled = await Promise.all(
    Object.entries(queries).map(([key, named]) =>
      runQuery(ch, named.query, named.schema).then(
        (rows) => [key, rows] as const
      )
    )
  );
  return Object.fromEntries(settled) as {
    [K in keyof M]: z.infer<M[K]["schema"]>[];
  };
}

const countRow = z.object({ total: z.coerce.number() });

/**
 * Count-plus-rows pagination: the rows page and its filtered total, assembled
 * into the `{ rows, total }` shape every paginated route returns. Sugar over
 * {@link runQueries}, so the two queries inherit named identity at the seam.
 */
export async function paginated<T extends z.ZodTypeAny>(
  ch: ChClient,
  rowsQuery: BuiltQuery,
  countQuery: BuiltQuery,
  rowSchema: T
): Promise<{ rows: z.infer<T>[]; total: number }> {
  const { rows, count } = await runQueries(ch, {
    count: { query: countQuery, schema: countRow },
    rows: { query: rowsQuery, schema: rowSchema },
  });
  return { rows, total: count[0]?.total ?? 0 };
}
