import type { Filter } from "./query-builder";

type PrismaCondition = Record<string, unknown>;

/**
 * Translate one UI filter operator into a Prisma field-condition object. String
 * matches use case-insensitive mode (Postgres). Returns null for operators with
 * no Prisma equivalent.
 */
const buildCondition = (filter: Filter): PrismaCondition | null => {
  const { operator, value } = filter;
  switch (operator) {
    case "eq": {
      return { equals: value };
    }
    case "neq": {
      return { not: value };
    }
    case "contains": {
      return { contains: String(value), mode: "insensitive" };
    }
    case "not_contains": {
      return { mode: "insensitive", not: { contains: String(value) } };
    }
    case "starts_with": {
      return { mode: "insensitive", startsWith: String(value) };
    }
    case "in": {
      return { in: Array.isArray(value) ? value : [value] };
    }
    case "gt": {
      return { gt: value };
    }
    case "gte": {
      return { gte: value };
    }
    case "lt": {
      return { lt: value };
    }
    case "lte": {
      return { lte: value };
    }
    case "is_empty": {
      return { equals: "" };
    }
    case "is_not_empty": {
      return { not: "" };
    }
    default: {
      return null;
    }
  }
};

/**
 * Build a Prisma `where` fragment from the same UI filter wire-format the
 * ClickHouse query-builder consumes, so the dashboard's data-table runs admin
 * lists (projects, API keys) server-side too. `allowed` is a column allowlist —
 * filters targeting anything else are dropped, so a field name can never be
 * smuggled through. Returns undefined when nothing usable remains.
 */
export const buildPrismaWhere = (
  filters: Filter[] | undefined,
  allowed: Set<string>,
  joinOperator: "and" | "or" = "and"
): Record<string, unknown> | undefined => {
  if (!filters?.length) {
    return;
  }
  const conditions: PrismaCondition[] = [];
  for (const filter of filters) {
    if (!allowed.has(filter.property)) {
      continue;
    }
    const condition = buildCondition(filter);
    if (condition) {
      conditions.push({ [filter.property]: condition });
    }
  }
  if (conditions.length === 0) {
    return;
  }
  return joinOperator === "or" ? { OR: conditions } : { AND: conditions };
};
