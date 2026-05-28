import { z } from "zod";

export const filterOperator = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "starts_with",
  "in",
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
    from: z.string().datetime(),
    to: z.string().datetime(),
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

export const buildPropertyAccessor = (
  property: string,
  valueType: "string" | "number",
  propertyParams: Map<string, string>
): string => {
  const paramName = getPropertyParamName(property, propertyParams);
  if (valueType === "number") {
    return `JSONExtractFloat64(properties, {${paramName}:String})`;
  }
  return `JSONExtractString(properties, {${paramName}:String})`;
};

export const getValueType = (value: unknown): "string" | "number" => {
  if (typeof value === "number") {
    return "number";
  }
  return "string";
};

export const buildFilterCondition = (
  filter: Filter,
  index: number,
  propertyParams: Map<string, string>
): { condition: string; paramName: string; paramValue: unknown } => {
  const valueType = getValueType(
    Array.isArray(filter.value) ? filter.value[0] : filter.value
  );
  const accessor = buildPropertyAccessor(filter.property, valueType, propertyParams);
  const paramName = `filter_${index}_value`;

  switch (filter.operator) {
    case "eq": {
      return {
        condition: `${accessor} = {${paramName}:${valueType === "number" ? "Float64" : "String"}}`,
        paramName,
        paramValue: filter.value,
      };
    }
    case "neq": {
      return {
        condition: `${accessor} != {${paramName}:${valueType === "number" ? "Float64" : "String"}}`,
        paramName,
        paramValue: filter.value,
      };
    }
    case "gt": {
      return {
        condition: `${accessor} > {${paramName}:Float64}`,
        paramName,
        paramValue: filter.value,
      };
    }
    case "gte": {
      return {
        condition: `${accessor} >= {${paramName}:Float64}`,
        paramName,
        paramValue: filter.value,
      };
    }
    case "lt": {
      return {
        condition: `${accessor} < {${paramName}:Float64}`,
        paramName,
        paramValue: filter.value,
      };
    }
    case "lte": {
      return {
        condition: `${accessor} <= {${paramName}:Float64}`,
        paramName,
        paramValue: filter.value,
      };
    }
    case "contains": {
      return {
        condition: `${accessor} LIKE {${paramName}:String}`,
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
      return `avg(JSONExtractFloat64(properties, {${paramName}:String})) AS value`;
    }
    case "sum": {
      if (!aggregateProperty) {
        throw new Error("aggregateProperty required for sum");
      }
      const paramName = getPropertyParamName(aggregateProperty, propertyParams);
      return `sum(JSONExtractFloat64(properties, {${paramName}:String})) AS value`;
    }
    case "min": {
      if (!aggregateProperty) {
        throw new Error("aggregateProperty required for min");
      }
      const paramName = getPropertyParamName(aggregateProperty, propertyParams);
      return `min(JSONExtractFloat64(properties, {${paramName}:String})) AS value`;
    }
    case "max": {
      if (!aggregateProperty) {
        throw new Error("aggregateProperty required for max");
      }
      const paramName = getPropertyParamName(aggregateProperty, propertyParams);
      return `max(JSONExtractFloat64(properties, {${paramName}:String})) AS value`;
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

export const buildQuery = (config: QueryConfig): QueryResult => {
  const propertyParams = new Map<string, string>();
  const selectColumns: string[] = [];
  const groupByColumns: string[] = [];
  const params: Record<string, unknown> = {
    from: config.timeRange.from,
    projectId: config.projectId,
    to: config.timeRange.to,
  };

  // Time bucket
  const timeBucket = buildTimeBucket(config.granularity);
  if (timeBucket) {
    selectColumns.push(timeBucket);
    groupByColumns.push("time_bucket");
  }

  // Group by properties
  if (config.groupBy) {
    for (const property of config.groupBy) {
      const paramName = getPropertyParamName(property, propertyParams);
      selectColumns.push(
        `JSONExtractString(properties, {${paramName}:String}) AS ${property}`
      );
      groupByColumns.push(property);
    }
  }

  // Aggregation
  selectColumns.push(
    buildAggregation(config.aggregation, config.aggregateProperty, propertyParams)
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

  if (groupByColumns.length > 0) {
    query += `\nGROUP BY ${groupByColumns.join(", ")}`;
  }

  query += `\nORDER BY ${groupByColumns.length > 0 ? groupByColumns.join(", ") : "timestamp DESC"}`;
  query += `\nLIMIT {limit:UInt32}`;
  params.limit = config.limit;

  // Add property name params
  for (const [property, paramName] of propertyParams) {
    params[paramName] = property;
  }

  return { params, query };
};