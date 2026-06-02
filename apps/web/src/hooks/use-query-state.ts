import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import * as React from "react";

import type { QueryParser } from "@/lib/query-params";

type SetterArg<T> = T | null | ((prev: T) => T | null);

function parseFromSearch<T>(
  search: Record<string, unknown>,
  key: string,
  parser: QueryParser<T> & { defaultValue: T }
): T {
  const raw = search[key];
  if (raw === null || raw === undefined) {
    return parser.defaultValue;
  }
  // TanStack Router JSON-parses URL values; convert non-strings back to JSON string for parsers
  const strValue = typeof raw === "string" ? raw : JSON.stringify(raw);
  return parser.parse(strValue) ?? parser.defaultValue;
}

function serializeForSearch(serialized: string): unknown {
  // Store as a parsed value so TanStack Router doesn't double-encode JSON strings.
  // If the serialized form is valid JSON, store the parsed object directly.
  try {
    return JSON.parse(serialized);
  } catch {
    return serialized;
  }
}

export function useQueryState<T>(
  key: string,
  parser: QueryParser<T> & { defaultValue: T }
): [T, (value: SetterArg<T>) => Promise<void>] {
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();

  const rawValue = React.useMemo(
    () =>
      parseFromSearch(location.search as Record<string, unknown>, key, parser),
    [location.search, key, parser]
  );

  // Stabilize reference: when parser.eq says content is unchanged, return the previous
  // reference so downstream useMemos don't invalidate due to unstable parser instances.
  const stableRef = React.useRef<T>(rawValue);
  const isEqual = parser.eq
    ? parser.eq(rawValue, stableRef.current)
    : rawValue === stableRef.current;
  if (!isEqual) {
    stableRef.current = rawValue;
  }
  const value = stableRef.current;

  const setValue = React.useCallback(
    (newValueOrUpdater: SetterArg<T>): Promise<void> => {
      const current = parseFromSearch(
        router.state.location.search as Record<string, unknown>,
        key,
        parser
      );
      const newValue =
        typeof newValueOrUpdater === "function"
          ? (newValueOrUpdater as (p: T) => T | null)(current)
          : newValueOrUpdater;

      return navigate({
        replace: parser.history !== "push",
        resetScroll: false,
        search: ((prev: Record<string, unknown>) => {
          const next = { ...prev };

          const equalsDefault =
            parser.clearOnDefault &&
            newValue !== null &&
            (parser.eq
              ? parser.eq(newValue, parser.defaultValue)
              : newValue === parser.defaultValue);

          if (newValue === null || equalsDefault) {
            delete next[key];
          } else {
            next[key] = serializeForSearch(parser.serialize(newValue));
          }

          return next;
        }) as never,
      }) as Promise<void>;
    },
    [navigate, key, parser, router]
  );

  return [value, setValue];
}

export function useQueryStates(
  parsers: Record<string, QueryParser<string> | QueryParser<string[]>>
): [
  Record<string, string | string[] | null>,
  (values: Partial<Record<string, string | string[] | null>>) => Promise<void>,
] {
  const location = useLocation();
  const navigate = useNavigate();

  const values = React.useMemo(() => {
    const search = location.search as Record<string, unknown>;
    const result: Record<string, string | string[] | null> = {};
    for (const key of Object.keys(parsers)) {
      const parser = parsers[key];
      const raw = search[key];
      if (raw === null || raw === undefined) {
        result[key] = null;
      } else {
        const strValue = typeof raw === "string" ? raw : JSON.stringify(raw);
        result[key] =
          (parser.parse(strValue) as string | string[] | null) ?? null;
      }
    }
    return result;
  }, [location.search, parsers]);

  const setValues = React.useCallback(
    (
      updates: Partial<Record<string, string | string[] | null>>
    ): Promise<void> =>
      navigate({
        replace: true,
        resetScroll: false,
        search: ((prev: Record<string, unknown>) => {
          const next = { ...prev };
          for (const [key, newValue] of Object.entries(updates)) {
            const parser = parsers[key];
            if (!parser) {
              continue;
            }
            if (newValue === null || newValue === undefined) {
              delete next[key];
            } else {
              next[key] = serializeForSearch(
                (parser as QueryParser<string | string[]>).serialize(newValue)
              );
            }
          }
          return next;
        }) as never,
      }) as Promise<void>,
    [navigate, parsers]
  );

  return [values, setValues];
}
