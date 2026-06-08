import type * as React from "react";

export interface QueryParserOptions {
  clearOnDefault?: boolean;
  history?: "push" | "replace";
  scroll?: boolean;
  shallow?: boolean;
  startTransition?: React.TransitionStartFunction;
  debounceMs?: number;
  throttleMs?: number;
}

export type UseQueryStateOptions<_T = string> = QueryParserOptions;

export interface QueryParser<T> extends QueryParserOptions {
  defaultValue?: T;
  parse: (value: string) => T | null;
  serialize: (value: T) => string;
  eq?: (a: T, b: T) => boolean;
  withDefault(value: T): QueryParser<T> & { defaultValue: T };
  withOptions(options: QueryParserOptions): QueryParser<T>;
}

export type SingleParser<T> = QueryParser<T>;

const makeParser = <T>(
  base: {
    parse: (value: string) => T | null;
    serialize: (value: T) => string;
    eq?: (a: T, b: T) => boolean;
    defaultValue?: T;
  } & QueryParserOptions
): QueryParser<T> => {
  const parser: QueryParser<T> = {
    ...base,
    withDefault(value: T) {
      return makeParser({ ...base, defaultValue: value }) as QueryParser<T> & {
        defaultValue: T;
      };
    },
    withOptions(options: QueryParserOptions) {
      return makeParser({ ...base, ...options });
    },
  };
  return parser;
};

export const createParser = <T>(impl: {
  parse: (value: string) => T | null;
  serialize: (value: T) => string;
  eq?: (a: T, b: T) => boolean;
}): QueryParser<T> => makeParser(impl);

export const parseAsInteger: QueryParser<number> = makeParser({
  parse: (value) => {
    const n = Number.parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
  },
  serialize: (value) => value.toString(),
});

export const parseAsString: QueryParser<string> = makeParser({
  parse: (value) => value,
  serialize: (value) => value,
});

export const parseAsArrayOf = <T>(
  parser: QueryParser<T>,
  separator = ","
): QueryParser<T[]> =>
  makeParser({
    eq: (a, b) => a.length === b.length && a.every((item, i) => item === b[i]),
    parse: (value) => {
      if (!value) {
        return [];
      }
      return value
        .split(separator)
        .map((v) => parser.parse(v))
        .filter((v): v is T => v !== null);
    },
    serialize: (value) => value.map((v) => parser.serialize(v)).join(separator),
  });

export const parseAsStringEnum = <T extends string>(
  values: readonly T[]
): QueryParser<T> =>
  makeParser({
    parse: (value) => (values.includes(value as T) ? (value as T) : null),
    serialize: (value) => value,
  });
