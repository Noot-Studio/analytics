// The single source of aggregation vocabulary and ClickHouse SQL shape. Both
// callers — the expression compiler (`metric-expression`) and the column
// builder (`query-builder`) — read this registry instead of carrying parallel
// switch statements, so adding an aggregation is a one-file change here.
//
// An entry owns "what SQL does this aggregation emit": its base form
// (`count()`, `uniq(player_id)`, `avg(<accessor>)`) and the conditional `*If`
// variant used when a matcher/filter predicate is present. The two callers map
// their own name strings (`uniq_players` vs `unique_players`) onto the shared
// `AggregationKind` keys, then read the SQL shape from one place.

export type AggregationKind =
  | "avg"
  | "count"
  | "max"
  | "min"
  | "sum"
  | "uniq_players"
  | "uniq_sessions";

interface EmitArgs {
  /**
   * The aggregated column expression for property aggregations (the result of
   * the caller's own property accessor). Ignored by count / uniq.
   */
  accessor?: string;
  /**
   * A ClickHouse boolean predicate. When present the `*If` conditional variant
   * is emitted; when absent the plain aggregate is.
   */
  predicate?: string | null;
}

interface AggregationDef {
  /** Whether the aggregation needs a property argument (avg/min/max/sum). */
  requiresProperty: boolean;
  /** Emit the ClickHouse aggregate SQL (no `AS value` alias). */
  emit: (args: EmitArgs) => string;
}

/** A count/uniq aggregation over a fixed column (or rows, for count). */
const fixedColumn = (column: string | null): AggregationDef => ({
  emit: ({ predicate }) => {
    if (column === null) {
      return predicate ? `countIf(${predicate})` : "count()";
    }
    return predicate ? `uniqIf(${column}, ${predicate})` : `uniq(${column})`;
  },
  requiresProperty: false,
});

/** A property aggregation (avg/min/max/sum) over a caller-supplied accessor. */
const propertyAgg = (fn: string): AggregationDef => ({
  emit: ({ accessor, predicate }) => {
    if (!accessor) {
      throw new Error(`${fn}() needs a property`);
    }
    return predicate
      ? `${fn}If(${accessor}, ${predicate})`
      : `${fn}(${accessor})`;
  },
  requiresProperty: true,
});

export const AGGREGATIONS: Record<AggregationKind, AggregationDef> = {
  avg: propertyAgg("avg"),
  count: fixedColumn(null),
  max: propertyAgg("max"),
  min: propertyAgg("min"),
  sum: propertyAgg("sum"),
  uniq_players: fixedColumn("player_id"),
  uniq_sessions: fixedColumn("session_id"),
};

/** Whether the given aggregation kind requires a property argument. */
export const aggregationRequiresProperty = (kind: AggregationKind): boolean =>
  AGGREGATIONS[kind].requiresProperty;

/** Emit the ClickHouse aggregate SQL for a kind (no `AS value` alias). */
export const emitAggregation = (
  kind: AggregationKind,
  args: EmitArgs
): string => AGGREGATIONS[kind].emit(args);
