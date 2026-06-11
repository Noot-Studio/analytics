import { toClickHouseDateTime } from "@sbox-analytics/events";
import { z } from "zod";

import { aggregationRequiresProperty, emitAggregation } from "./aggregations";
import type { AggregationKind } from "./aggregations";
import {
  compileMetricExpression,
  validateMetricExpression,
} from "./metric-expression";
import {
  buildFilterCondition,
  buildPropertyAccessor,
  filterOperator,
  filterSchema,
  getPropertyParamName,
  getValueType,
} from "./query-fragments";
import type { Filter } from "./query-fragments";

// Re-export the shared fragment primitives so existing importers of
// `query-builder` (routers, web filters) keep working through this module.
export {
  buildFilterCondition,
  buildPropertyAccessor,
  type Filter,
  filterOperator,
  filterSchema,
  getValueType,
};

export const aggregationSchema = z.enum([
  "avg",
  "count",
  "max",
  "min",
  "sum",
  "unique_players",
  "unique_sessions",
]);

export type Aggregation = z.infer<typeof aggregationSchema>;

export const queryConfigSchema = z.object({
  aggregateProperty: z.string().min(1).optional(),
  // A metric is either a single aggregation (`aggregation`) or a combined
  // expression (`expression`); `withMetricConfigRules` enforces exactly one.
  aggregation: aggregationSchema.optional(),
  eventType: z.string().min(1).optional(),
  expression: z.string().min(1).optional(),
  filters: z.array(filterSchema).max(10).optional(),
  granularity: z.enum(["hour", "day", "week", "month", "none"]).default("day"),
  groupBy: z.array(z.string().min(1)).max(5).optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  projectId: z.string().min(1),
  timeRange: z.object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  }),
});

export type QueryConfig = z.infer<typeof queryConfigSchema>;

/**
 * {@link buildQuery}'s input, widened so a consumer can scope a query to a set
 * of projects instead of one. The router-facing `queryConfigSchema` stays a
 * single `projectId` (its public contract is unchanged); only internal callers
 * that legitimately span projects — an org-wide alert evaluating one metric
 * across every project in the org — pass an array, which emits
 * `project_id IN (...)` instead of `project_id = ...`.
 */
export type QueryScope = Omit<QueryConfig, "projectId"> & {
  projectId: string | string[];
};

/**
 * Layer the "exactly one of aggregation / expression" rule (plus expression
 * syntax validation) onto a config schema. Applied at user-input boundaries
 * (metric save, preview, raw JSON editor) — kept off the bare object schema so
 * `.omit`/`.extend` still work for the widget and execution variants.
 */
export const withMetricConfigRules = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((value, ctx) => {
    const config = value as { aggregation?: unknown; expression?: unknown };
    const hasAggregation = Boolean(config.aggregation);
    const hasExpression = Boolean(config.expression);
    if (hasAggregation === hasExpression) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either an aggregation or an expression, not both",
      });
      return;
    }
    if (hasExpression && typeof config.expression === "string") {
      const error = validateMetricExpression(config.expression);
      if (error) {
        ctx.addIssue({
          code: "custom",
          message: error,
          path: ["expression"],
        });
      }
    }
  });

interface QueryResult {
  query: string;
  params: Record<string, unknown>;
}

// The schema names the unique aggregations `unique_*`; the registry keys them
// `uniq_*`. Everything else is shared verbatim.
const AGGREGATION_KIND: Record<Aggregation, AggregationKind> = {
  avg: "avg",
  count: "count",
  max: "max",
  min: "min",
  sum: "sum",
  unique_players: "uniq_players",
  unique_sessions: "uniq_sessions",
};

export const buildAggregation = (
  aggregation: Aggregation,
  aggregateProperty: string | undefined,
  propertyParams: Map<string, string>
): string => {
  const kind = AGGREGATION_KIND[aggregation];
  let accessor: string | undefined;
  if (aggregationRequiresProperty(kind)) {
    if (!aggregateProperty) {
      throw new Error(`aggregateProperty required for ${aggregation}`);
    }
    const paramName = getPropertyParamName(aggregateProperty, propertyParams);
    accessor = `JSONExtractFloat(properties, {${paramName}:String})`;
  }
  return `${emitAggregation(kind, { accessor })} AS value`;
};

export const buildTimeBucket = (
  granularity: QueryConfig["granularity"]
): string | null => {
  switch (granularity) {
    case "hour": {
      return "toStartOfHour(timestamp) AS time_bucket";
    }
    case "day": {
      return "toStartOfDay(timestamp) AS time_bucket";
    }
    case "week": {
      return "toStartOfWeek(timestamp) AS time_bucket";
    }
    case "month": {
      return "toStartOfMonth(timestamp) AS time_bucket";
    }
    case "none": {
      return null;
    }
    default: {
      throw new Error(`Unsupported granularity: ${granularity}`);
    }
  }
};

/**
 * Translate a list of advanced filters into ClickHouse WHERE fragments, binding
 * every value into `params`. Reusable by hand-written procedures (e.g. the raw
 * events table) that need the same operator semantics as {@link buildQuery}.
 *
 * @param startIndex offsets generated param names so they never collide with a
 *   procedure's own params.
 */
export const applyFilters = (
  filters: Filter[] | undefined,
  params: Record<string, unknown>,
  startIndex = 0
): string[] => {
  const conditions: string[] = [];
  if (!filters?.length) {
    return conditions;
  }
  const propertyParams = new Map<string, string>();
  for (let i = 0; i < filters.length; i += 1) {
    const filter = filters[i];
    if (!filter) {
      continue;
    }
    const { condition, paramName, paramValue } = buildFilterCondition(
      filter,
      startIndex + i,
      propertyParams
    );
    conditions.push(condition);
    if (
      typeof paramValue === "object" &&
      paramValue !== null &&
      !Array.isArray(paramValue)
    ) {
      Object.assign(params, paramValue);
    } else {
      params[paramName] = paramValue;
    }
  }
  for (const [property, paramName] of propertyParams) {
    params[paramName] = property;
  }
  return conditions;
};

export interface ColumnFilterDef {
  /** Exact SQL expression (or SELECT alias) the filter compares against. */
  expr: string;
  /** Value type — drives the bound param's ClickHouse type and operator set. */
  type: "string" | "number";
}

/**
 * Combine UI-derived filters into a single SQL condition (suitable for WHERE or
 * HAVING) against an explicit column allowlist, joined by `joinOperator`. Unlike
 * {@link applyFilters}, each column maps to an exact SQL expression/alias and a
 * fixed value type, so aggregate aliases (`avg_fps`, `event_count`, …) can be
 * filtered directly. Filters whose `property` is not in `columns` are dropped.
 * Returns `null` when nothing usable remains. Values bind into `params`.
 */
export const buildColumnFilters = (
  filters: Filter[] | undefined,
  columns: Record<string, ColumnFilterDef>,
  params: Record<string, unknown>,
  joinOperator: "and" | "or" = "and",
  startIndex = 0
): string | null => {
  if (!filters?.length) {
    return null;
  }
  const propertyParams = new Map<string, string>();
  const conditions: string[] = [];
  for (let i = 0; i < filters.length; i += 1) {
    const filter = filters[i];
    if (!filter) {
      continue;
    }
    const column = columns[filter.property];
    if (!column) {
      continue;
    }
    const { condition, paramName, paramValue } = buildFilterCondition(
      filter,
      startIndex + i,
      propertyParams,
      { accessor: column.expr, valueType: column.type }
    );
    conditions.push(condition);
    if (
      typeof paramValue === "object" &&
      paramValue !== null &&
      !Array.isArray(paramValue)
    ) {
      Object.assign(params, paramValue);
    } else {
      params[paramName] = paramValue;
    }
  }
  if (conditions.length === 0) {
    return null;
  }
  const glue = joinOperator === "or" ? " OR " : " AND ";
  return `(${conditions.join(glue)})`;
};

export const buildQuery = (config: QueryScope): QueryResult => {
  const propertyParams = new Map<string, string>();
  const selectColumns: string[] = [];
  const groupByColumns: string[] = [];
  // A single project compares with `=`; a set (org-wide alert scope) uses `IN`.
  const projectScope = Array.isArray(config.projectId)
    ? {
        clause: "project_id IN {projectIds:Array(String)}",
        params: { projectIds: config.projectId },
      }
    : {
        clause: "project_id = {projectId:String}",
        params: { projectId: config.projectId },
      };
  const params: Record<string, unknown> = {
    from: toClickHouseDateTime(config.timeRange.from),
    to: toClickHouseDateTime(config.timeRange.to),
    ...projectScope.params,
  };

  // Time bucket
  const timeBucket = buildTimeBucket(config.granularity);
  if (timeBucket) {
    selectColumns.push(timeBucket);
    groupByColumns.push("time_bucket");
  }

  // Group by properties
  if (config.groupBy) {
    for (let i = 0; i < config.groupBy.length; i += 1) {
      const property = config.groupBy[i];
      if (property === undefined) {
        continue;
      }
      const accessor = buildPropertyAccessor(
        property,
        "string",
        propertyParams
      );
      const alias = `group_col_${i}`;
      selectColumns.push(`${accessor} AS ${alias}`);
      groupByColumns.push(alias);
    }
  }

  // Value column: a combined expression compiles its own conditional
  // aggregates (event selection lives in each `...If` predicate), otherwise a
  // single aggregation drives the `WHERE event_type` / filter clauses below.
  if (config.expression) {
    const compiled = compileMetricExpression(config.expression);
    selectColumns.push(`${compiled.valueExpr} AS value`);
    Object.assign(params, compiled.params);
  } else {
    if (!config.aggregation) {
      throw new Error("Metric requires an aggregation or an expression");
    }
    selectColumns.push(
      buildAggregation(
        config.aggregation,
        config.aggregateProperty,
        propertyParams
      )
    );
  }

  // Build WHERE clauses
  const whereConditions: string[] = [
    projectScope.clause,
    "timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}",
  ];

  if (!config.expression) {
    if (config.eventType) {
      whereConditions.push("event_type = {eventType:String}");
      params.eventType = config.eventType;
    }

    if (config.filters) {
      for (let i = 0; i < config.filters.length; i += 1) {
        const filter = config.filters[i];
        if (filter) {
          const { condition, paramName, paramValue } = buildFilterCondition(
            filter,
            i,
            propertyParams
          );
          whereConditions.push(condition);

          if (
            typeof paramValue === "object" &&
            paramValue !== null &&
            !Array.isArray(paramValue)
          ) {
            Object.assign(params, paramValue);
          } else {
            params[paramName] = paramValue;
          }
        }
      }
    }
  }

  // Build query
  let query = `SELECT\n  ${selectColumns.join(",\n  ")}\nFROM analytics.events\nWHERE ${whereConditions.join("\n  AND ")}`;

  // Without grouping the SELECT is a single aggregate row, where ordering by
  // a raw column is invalid (NOT_AN_AGGREGATE).
  if (groupByColumns.length > 0) {
    query += `\nGROUP BY ${groupByColumns.join(", ")}`;
    query += `\nORDER BY ${groupByColumns.join(", ")}`;
  }

  query += `\nLIMIT {limit:UInt32}`;
  params.limit = config.limit;

  // Add property name params
  for (const [property, paramName] of propertyParams) {
    params[paramName] = property;
  }

  return { params, query };
};
