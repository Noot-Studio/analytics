import { EVENT_COLUMNS } from "@sbox-analytics/events";
import { z } from "zod";

// Low-level SQL fragment builders shared by the query builder and the metric
// expression compiler. Kept in their own module so both can depend on them
// without forming an import cycle. The column allowlist here is a security
// boundary: only these identifiers are ever interpolated as raw SQL columns.

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

export type Filter = z.infer<typeof filterSchema>;

export const getPropertyParamName = (
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

// Allowlist form of the shared event-column metadata: only these exact
// identifiers are ever interpolated as raw SQL column names; everything else is
// read out of the JSON `properties` blob via JSONExtract.
const KNOWN_COLUMNS = new Set<string>(EVENT_COLUMNS);

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
