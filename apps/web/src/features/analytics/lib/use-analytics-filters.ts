import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { DEFAULT_RANGE, pickGranularity, resolveRange } from "./filters";
import type {
  AnalyticsFilter,
  AnalyticsSearch,
  Granularity,
  TimeRange,
} from "./filters";

export interface UseAnalyticsFilters {
  /** Resolved ISO datetime bounds for the active range. */
  from: string;
  to: string;
  /** Active per-field filters (shared shape with the backend query-builder). */
  filters: AnalyticsFilter[];
  /** Chart bucket size derived from the active range. */
  granularity: Granularity;
  range: TimeRange;
  customFrom?: string;
  customTo?: string;
  setRange: (range: TimeRange, from?: string, to?: string) => void;
  setFilters: (filters: AnalyticsFilter[]) => void;
}

/**
 * Single source of truth for an analytics page's time range + field filters.
 *
 * State lives in the URL (TanStack Router search params) so it is shareable,
 * bookmarkable, and survives refresh. Charts and tables on the same page read
 * the same hook, keeping them in lockstep.
 */
export const useAnalyticsFilters = (): UseAnalyticsFilters => {
  const search = useSearch({ strict: false }) as Partial<AnalyticsSearch>;
  const navigate = useNavigate();

  const range = search.range ?? DEFAULT_RANGE;
  const filters = useMemo(() => search.filters ?? [], [search.filters]);
  const { from, to } = useMemo(
    () => resolveRange({ from: search.from, range, to: search.to }),
    [range, search.from, search.to]
  );

  const setRange = useCallback(
    (nextRange: TimeRange, nextFrom?: string, nextTo?: string) => {
      navigate({
        replace: true,
        search: ((prev: Partial<AnalyticsSearch>) => ({
          ...prev,
          from: nextRange === "custom" ? nextFrom : undefined,
          range: nextRange,
          to: nextRange === "custom" ? nextTo : undefined,
        })) as never,
      });
    },
    [navigate]
  );

  const setFilters = useCallback(
    (next: AnalyticsFilter[]) => {
      navigate({
        replace: true,
        search: ((prev: Partial<AnalyticsSearch>) => ({
          ...prev,
          filters: next.length > 0 ? next : undefined,
        })) as never,
      });
    },
    [navigate]
  );

  return {
    customFrom: search.from,
    customTo: search.to,
    filters,
    from,
    granularity: pickGranularity(from, to),
    range,
    setFilters,
    setRange,
    to,
  };
};
