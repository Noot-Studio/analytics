import { getValidFilters } from "@/lib/data-table";
import type { ExtendedColumnFilter, JoinOperator } from "@/types/data-table";

type FilterValue = string | string[];
interface FilterShape {
  value: FilterValue;
  variant: string;
}
type Comparator = (cell: unknown, filter: FilterShape) => boolean;

const toText = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

const toNumber = (value: unknown): number =>
  Array.isArray(value) ? Number(value[0]) : Number(value);

const isBlank = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

const isNumeric = (filter: FilterShape): boolean =>
  filter.variant === "number" || filter.variant === "range";

const includesText = (cell: unknown, value: FilterValue): boolean =>
  toText(cell).toLowerCase().includes(toText(value).toLowerCase());

const inList = (cell: unknown, value: FilterValue): boolean =>
  Array.isArray(value) && value.map(String).includes(toText(cell));

const isBetween = (cell: unknown, value: FilterValue): boolean => {
  const [min, max] = Array.isArray(value) ? value : [];
  const n = toNumber(cell);
  const aboveMin = min === undefined || min === "" || n >= Number(min);
  const belowMax = max === undefined || max === "" || n <= Number(max);
  return aboveMin && belowMax;
};

/**
 * One comparator per UI operator. Semantics mirror the server query-builder
 * (see `lib/api-filters` + `packages/api/query-builder`) so a client-side table
 * filters the same way its server-side siblings do — except `iLike`/`notILike`
 * match case-insensitively, preserving the live table's prior `includesString`
 * behavior. Operators with no client equivalent (e.g. `isRelativeToToday`) are
 * absent and fall through to a pass, rather than hiding every row.
 */
const COMPARATORS: Record<string, Comparator> = {
  eq: (cell, filter) =>
    isNumeric(filter)
      ? toNumber(cell) === toNumber(filter.value)
      : toText(cell) === toText(filter.value),
  gt: (cell, filter) => toNumber(cell) > toNumber(filter.value),
  gte: (cell, filter) => toNumber(cell) >= toNumber(filter.value),
  iLike: (cell, filter) => includesText(cell, filter.value),
  inArray: (cell, filter) => inList(cell, filter.value),
  isBetween: (cell, filter) => isBetween(cell, filter.value),
  isEmpty: (cell) => isBlank(cell),
  isNotEmpty: (cell) => !isBlank(cell),
  lt: (cell, filter) => toNumber(cell) < toNumber(filter.value),
  lte: (cell, filter) => toNumber(cell) <= toNumber(filter.value),
  ne: (cell, filter) =>
    isNumeric(filter)
      ? toNumber(cell) !== toNumber(filter.value)
      : toText(cell) !== toText(filter.value),
  notILike: (cell, filter) => !includesText(cell, filter.value),
  notInArray: (cell, filter) => !inList(cell, filter.value),
};

const toPredicate =
  <TData>(filter: ExtendedColumnFilter<TData>) =>
  (row: TData): boolean => {
    const comparator = COMPARATORS[filter.operator];
    return comparator ? comparator(row[filter.id], filter) : true;
  };

/**
 * Evaluate the data-table's advanced filter expression in the client against an
 * in-memory row set. Conditions combine with `joinOperator` (AND / OR). Filters
 * with no usable value are dropped, matching {@link getValidFilters}, so an
 * empty or partial expression leaves the rows untouched.
 */
export const filterRows = <TData>(
  rows: TData[],
  filters: ExtendedColumnFilter<TData>[],
  joinOperator: JoinOperator
): TData[] => {
  const valid = getValidFilters(filters);
  if (valid.length === 0) {
    return rows;
  }
  const predicates = valid.map((filter) => toPredicate(filter));
  return rows.filter((row) =>
    joinOperator === "or"
      ? predicates.some((predicate) => predicate(row))
      : predicates.every((predicate) => predicate(row))
  );
};
