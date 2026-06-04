import { z } from "zod";

export const filterOperator = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "not_contains",
  "starts_with",
  "in",
  "is_empty",
  "is_not_empty",
]);

export const filterSchema = z.object({
  operator: filterOperator,
  property: z.string().min(1),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

export const queryConfigSchema = z.object({
  aggregateProperty: z.string().min(1).optional(),
  aggregation: z.enum([
    "avg",
    "count",
    "max",
    "min",
    "sum",
    "unique_players",
    "unique_sessions",
  ]),
  eventType: z.string().min(1).optional(),
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
export type Filter = z.infer<typeof filterSchema>;

interface QueryResult {
  query: string;
  params: Record<string, unknown>;
}

const getPropertyParamName = (
  property: string,
  propertyParams: Map<string, string>
): string => {
  let paramName = propertyParams.get(property);
  if (!paramName) {
    paramName = `prop_${property}_name`;
    propertyParams.set(property, paramName);
  }
  return paramName;
};

/**
 * Real top-level columns on `analytics.events`. Filters targeting these
 * reference the column directly; everything else is read out of the JSON
 * `properties` blob via JSONExtract. The set doubles as an allowlist — only
 * these exact identifiers are ever interpolated as raw SQL column names.
 */
const KNOWN_COLUMNS = new Set([
  "project_id",
  "event_type",
  "timestamp",
  "session_id",
  "player_id",
  "scene",
  "pos_x",
  "pos_y",
  "pos_z",
]);

export const buildPropertyAccessor = (
  property: string,
  valueType: "string" | "number",
  propertyParams: Map<string, string>
): string => {
  if (KNOWN_COLUMNS.has(property)) {
    return property;
  }
  const paramName = getPropertyParamName(property, propertyParams);
  if (valueType === "number") {
    return `JSONExtractFloat(properties, {${paramName}:String})`;
  }
  return `JSONExtractString(properties, {${paramName}:String})`;
};

export const getValueType = (value: unknown): "string" | "number" => {
  if (typeof value === "number") {
    return "number";
  }
  return "string";
};

/** Operators that compare the accessor against a single bound value. */
const BINARY_OPERATORS = {
  eq: "=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  neq: "!=",
} as const;

export const buildFilterCondition = (
  filter: Filter,
  index: number,
  propertyParams: Map<string, string>,
  options?: { accessor?: string; valueType?: "string" | "number" }
): { condition: string; paramName: string; paramValue: unknown } => {
  const valueType =
    options?.valueType ??
    getValueType(Array.isArray(filter.value) ? filter.value[0] : filter.value);
  const accessor =
    options?.accessor ??
    buildPropertyAccessor(filter.property, valueType, propertyParams);
  const paramName = `filter_${index}_value`;

  const binarySymbol =
    BINARY_OPERATORS[filter.operator as keyof typeof BINARY_OPERATORS];
  if (binarySymbol) {
    // Only equality respects the string/number distinction; ordering is numeric.
    const isEquality = filter.operator === "eq" || filter.operator === "neq";
    const paramType =
      isEquality && valueType === "string" ? "String" : "Float64";
    return {
      condition: `${accessor} ${binarySymbol} {${paramName}:${paramType}}`,
      paramName,
      paramValue: filter.value,
    };
  }

  switch (filter.operator) {
    case "contains": {
      return {
        condition: `${accessor} LIKE {${paramName}:String}`,
        paramName,
        paramValue: `%${filter.value}%`,
      };
    }
    case "not_contains": {
      return {
        condition: `${accessor} NOT LIKE {${paramName}:String}`,
        paramName,
        paramValue: `%${filter.value}%`,
      };
    }
    case "starts_with": {
      return {
        condition: `${accessor} LIKE {${paramName}:String}`,
        paramName,
        paramValue: `${filter.value}%`,
      };
    }
    case "in": {
      const values = Array.isArray(filter.value)
        ? filter.value
        : [String(filter.value)];
      const placeholders = values
        .map((_, i) => `{${paramName}_${i}:String}`)
        .join(", ");
      const params: Record<string, string> = {};
      for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        if (value !== undefined) {
          params[`${paramName}_${i}`] = value;
        }
      }
      return {
        condition: `${accessor} IN (${placeholders})`,
        paramName,
        paramValue: params,
      };
    }
    case "is_empty": {
      return {
        condition: `empty(${accessor})`,
        paramName,
        paramValue: {},
      };
    }
    case "is_not_empty": {
      return {
        condition: `notEmpty(${accessor})`,
        paramName,
        paramValue: {},
      };
    }
    default: {
      throw new Error(`Unsupported operator: ${filter.operator}`);
    }
  }
};

export const buildAggregation = (
  aggregation: QueryConfig["aggregation"],
  aggregateProperty: string | undefined,
  propertyParams: Map<string, string>
): string => {
  switch (aggregation) {
    case "count": {
      return "count() AS value";
    }
    case "unique_players": {
      return "uniq(player_id) AS value";
    }
    case "unique_sessions": {
      return "uniq(session_id) AS value";
    }
    case "avg": {
      if (!aggregateProperty) {
        throw new Error("aggregateProperty required for avg");
      }
      const paramName = getPropertyParamName(aggregateProperty, propertyParams);
      return `avg(JSONExtractFloat(properties, {${paramName}:String})) AS value`;
    }
    case "sum": {
      if (!aggregateProperty) {
        throw new Error("aggregateProperty required for sum");
      }
      const paramName = getPropertyParamName(aggregateProperty, propertyParams);
      return `sum(JSONExtractFloat(properties, {${paramName}:String})) AS value`;
    }
    case "min": {
      if (!aggregateProperty) {
        throw new Error("aggregateProperty required for min");
      }
      const paramName = getPropertyParamName(aggregateProperty, propertyParams);
      return `min(JSONExtractFloat(properties, {${paramName}:String})) AS value`;
    }
    case "max": {
      if (!aggregateProperty) {
        throw new Error("aggregateProperty required for max");
      }
      const paramName = getPropertyParamName(aggregateProperty, propertyParams);
      return `max(JSONExtractFloat(properties, {${paramName}:String})) AS value`;
    }
    default: {
      throw new Error(`Unsupported aggregation: ${aggregation}`);
    }
  }
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

/**
 * ClickHouse can't parse an ISO `Z` suffix as DateTime64(3); it expects
 * `YYYY-MM-DD HH:MM:SS[.mmm]` (UTC is the column timezone already).
 */
const toClickHouseDateTime = (iso: string): string =>
  iso.replace("T", " ").replace("Z", "");

export const buildQuery = (config: QueryConfig): QueryResult => {
  const propertyParams = new Map<string, string>();
  const selectColumns: string[] = [];
  const groupByColumns: string[] = [];
  const params: Record<string, unknown> = {
    from: toClickHouseDateTime(config.timeRange.from),
    projectId: config.projectId,
    to: toClickHouseDateTime(config.timeRange.to),
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
      const property = config.groupBy[i]!;
      const paramName = getPropertyParamName(property, propertyParams);
      const alias = `group_col_${i}`;
      selectColumns.push(
        `JSONExtractString(properties, {${paramName}:String}) AS ${alias}`
      );
      groupByColumns.push(alias);
    }
  }

  // Aggregation
  selectColumns.push(
    buildAggregation(
      config.aggregation,
      config.aggregateProperty,
      propertyParams
    )
  );

  // Build WHERE clauses
  const whereConditions: string[] = [
    "project_id = {projectId:String}",
    "timestamp BETWEEN {from:DateTime64(3)} AND {to:DateTime64(3)}",
  ];

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
