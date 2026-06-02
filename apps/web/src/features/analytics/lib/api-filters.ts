import type { Filter } from "@sbox-analytics/api/query-builder";

import { getValidFilters } from "@/lib/data-table";
import type { ExtendedColumnFilter } from "@/types/data-table";

/**
 * Maps the data-table's UI filter operators onto the backend query-builder's
 * operator set. `isBetween` is handled separately (expanded into a gte/lte
 * pair). The only UI operators with no server equivalent are those exposed
 * solely by the multiSelect/date variants — which no analytics column uses —
 * so every operator a user can actually reach translates to a real condition.
 */
const OPERATOR_MAP = {
  eq: "eq",
  gt: "gt",
  gte: "gte",
  iLike: "contains",
  inArray: "in",
  isEmpty: "is_empty",
  isNotEmpty: "is_not_empty",
  lt: "lt",
  lte: "lte",
  ne: "neq",
  notILike: "not_contains",
} as const;

const NUMERIC_VARIANTS = new Set(["number", "range"]);
const EMPTY_OPERATORS = new Set(["is_empty", "is_not_empty"]);

/**
 * Translate the URL-persisted data-table filters into the wire format every
 * analytics endpoint consumes, so filtering runs server-side instead of in the
 * client. Numeric-column values are coerced to numbers so they bind as Float64.
 */
export const toApiFilters = <TData>(
  filters: ExtendedColumnFilter<TData>[]
): Filter[] =>
  getValidFilters(filters).flatMap((filter) => {
    // A range is two independent bounds; emit them as gte + lte so the existing
    // numeric operators do the work and no dedicated BETWEEN op is needed.
    if (filter.operator === "isBetween") {
      const [min, max] = Array.isArray(filter.value) ? filter.value : [];
      const conditions: Filter[] = [];
      if (min !== undefined && min !== "") {
        conditions.push({
          operator: "gte",
          property: filter.id,
          value: Number(min),
        });
      }
      if (max !== undefined && max !== "") {
        conditions.push({
          operator: "lte",
          property: filter.id,
          value: Number(max),
        });
      }
      return conditions;
    }

    const operator = OPERATOR_MAP[filter.operator as keyof typeof OPERATOR_MAP];
    if (!operator) {
      return [];
    }

    // Empty/non-empty carry no value — the server reads the column directly.
    if (EMPTY_OPERATORS.has(operator)) {
      return [{ operator, property: filter.id, value: "" }];
    }

    const value =
      NUMERIC_VARIANTS.has(filter.variant) && !Array.isArray(filter.value)
        ? Number(filter.value)
        : filter.value;

    return [{ operator, property: filter.id, value }];
  });
