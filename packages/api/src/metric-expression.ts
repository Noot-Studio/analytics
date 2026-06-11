import {
  AGGREGATIONS,
  aggregationRequiresProperty,
  emitAggregation,
} from "./aggregations";
import type { AggregationKind } from "./aggregations";
import { buildFilterCondition, buildPropertyAccessor } from "./query-fragments";
import type { Filter } from "./query-fragments";

// A small, PromQL-flavoured expression language for metrics that combine
// several aggregates — ratios, percentages, sums of counts. Because every leaf
// aggregates the *same* `analytics.events` table over the *same* time window and
// group-by, the whole expression compiles to a SINGLE conditional-aggregation
// query: each `agg(selector)` becomes an `aggIf(predicate)` and the arithmetic
// lives in the SELECT projection. The result is still one `value` column, so the
// downstream result-shape / visualisation machinery is untouched.
//
//   sum({event_type="purchase"}) / sum({event_type="add_cart"}) * 100
//     -> countIf(event_type = …) / nullIf(countIf(event_type = …), 0) * 100
//
// Matchers mirror the full filter-operator set so the structured builder and the
// raw text are lossless views of each other:
//   =  !=  =~ (contains)  !~ (not contains)  ^= (starts with)
//   >  >=  <  <=  in ("a","b")  is empty  is not empty

/** Aggregations that operate on a property value (vs counting rows/uniques). */
export const isPropertyAggregation = (
  aggregation: MetricAggregation
): boolean => aggregationRequiresProperty(aggregation);

export type MetricAggregation = AggregationKind;

/** A selector matcher is exactly a query-builder {@link Filter}. */
export type Matcher = Filter;

export interface AggNode {
  type: "agg";
  aggregation: MetricAggregation;
  property?: string;
  matchers: Matcher[];
}

export type Node =
  | { type: "number"; value: number }
  | { type: "neg"; operand: Node }
  | { type: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node }
  | AggNode;

type Token =
  | { kind: "num"; value: number }
  | { kind: "ident"; value: string }
  | { kind: "str"; value: string }
  | { kind: "op"; value: string };

const WHITESPACE = /\s/u;
const DIGIT = /[0-9.]/u;
const IDENT_START = /[A-Za-z_]/u;
const IDENT_PART = /[A-Za-z0-9_.]/u;
const IDENT_FULL = /^[A-Za-z_][A-Za-z0-9_.]*$/u;
const SINGLE_OPERATORS = "+-*/(){},=<>";
const TWO_CHAR_OPERATORS = new Set(["!=", "=~", "!~", "^=", ">=", "<="]);

const BINARY_PRECEDENCE: Record<"+" | "-" | "*" | "/", number> = {
  "*": 2,
  "+": 1,
  "-": 1,
  "/": 2,
};
const UNARY_PRECEDENCE = 3;

const tokenize = (input: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i] ?? "";
    if (WHITESPACE.test(char)) {
      i += 1;
      continue;
    }
    const pair = input.slice(i, i + 2);
    if (TWO_CHAR_OPERATORS.has(pair)) {
      tokens.push({ kind: "op", value: pair });
      i += 2;
      continue;
    }
    if (char === "!") {
      throw new Error('Unexpected "!" (did you mean "!=" or "!~"?)');
    }
    if (SINGLE_OPERATORS.includes(char)) {
      tokens.push({ kind: "op", value: char });
      i += 1;
      continue;
    }
    if (char === '"') {
      let j = i + 1;
      while (j < input.length && input[j] !== '"') {
        j += 1;
      }
      if (j >= input.length) {
        throw new Error("Unterminated string literal");
      }
      tokens.push({ kind: "str", value: input.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (DIGIT.test(char)) {
      let j = i;
      while (j < input.length && DIGIT.test(input[j] ?? "")) {
        j += 1;
      }
      const value = Number(input.slice(i, j));
      if (Number.isNaN(value)) {
        throw new TypeError(`Invalid number "${input.slice(i, j)}"`);
      }
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }
    if (IDENT_START.test(char)) {
      let j = i;
      while (j < input.length && IDENT_PART.test(input[j] ?? "")) {
        j += 1;
      }
      tokens.push({ kind: "ident", value: input.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`Unexpected character "${char}"`);
  }
  return tokens;
};

const tokenText = (token: Token | undefined): string => {
  if (!token) {
    return "end of expression";
  }
  return token.kind === "num" ? String(token.value) : token.value;
};

const parse = (tokens: Token[]): Node => {
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token | undefined => {
    const token = tokens[pos];
    pos += 1;
    return token;
  };

  const expect = <K extends Token["kind"]>(
    kind: K,
    value?: string
  ): Extract<Token, { kind: K }> => {
    const token = next();
    if (!token || token.kind !== kind || (value && token.value !== value)) {
      throw new Error(`Expected "${value ?? kind}", got "${tokenText(token)}"`);
    }
    return token as Extract<Token, { kind: K }>;
  };

  const isOp = (value: string): boolean => {
    const token = peek();
    return token?.kind === "op" && token.value === value;
  };

  const isIdent = (value: string): boolean => {
    const token = peek();
    return token?.kind === "ident" && token.value === value;
  };

  /** A property name is an identifier, or a quoted string for exotic keys. */
  const readKey = (): string => {
    const token = peek();
    if (token?.kind === "ident" || token?.kind === "str") {
      next();
      return token.value;
    }
    throw new Error(`Expected a property name, got "${tokenText(token)}"`);
  };

  const parseSignedNumber = (): number => {
    let sign = 1;
    if (isOp("-")) {
      next();
      sign = -1;
    }
    return sign * expect("num").value;
  };

  const parseInList = (): string[] => {
    expect("op", "(");
    const values: string[] = [];
    let more = !isOp(")");
    while (more) {
      values.push(expect("str").value);
      if (isOp(",")) {
        next();
      } else {
        more = false;
      }
    }
    expect("op", ")");
    return values;
  };

  const parseIsEmpty = (property: string): Filter => {
    if (isIdent("not")) {
      next();
      expect("ident", "empty");
      return { operator: "is_not_empty", property, value: "" };
    }
    expect("ident", "empty");
    return { operator: "is_empty", property, value: "" };
  };

  const STRING_MATCHERS: Record<string, Filter["operator"]> = {
    "!=": "neq",
    "!~": "not_contains",
    "=": "eq",
    "=~": "contains",
    "^=": "starts_with",
  };
  const NUMBER_MATCHERS: Record<string, Filter["operator"]> = {
    "<": "lt",
    "<=": "lte",
    ">": "gt",
    ">=": "gte",
  };

  const parseMatcher = (): Filter => {
    const property = readKey();
    const token = next();
    if (!token) {
      throw new Error(`Expected an operator after "${property}"`);
    }
    if (token.kind === "op") {
      const stringOp = STRING_MATCHERS[token.value];
      if (stringOp) {
        return { operator: stringOp, property, value: expect("str").value };
      }
      const numberOp = NUMBER_MATCHERS[token.value];
      if (numberOp) {
        return { operator: numberOp, property, value: parseSignedNumber() };
      }
    }
    if (token.kind === "ident" && token.value === "in") {
      return { operator: "in", property, value: parseInList() };
    }
    if (token.kind === "ident" && token.value === "is") {
      return parseIsEmpty(property);
    }
    throw new Error(
      `Unexpected token "${tokenText(token)}" after "${property}"`
    );
  };

  const parseMatchers = (): Filter[] => {
    const matchers: Filter[] = [];
    if (!isOp("{")) {
      return matchers;
    }
    next();
    if (isOp("}")) {
      next();
      return matchers;
    }
    let more = true;
    while (more) {
      matchers.push(parseMatcher());
      if (isOp(",")) {
        next();
      } else {
        more = false;
      }
    }
    expect("op", "}");
    return matchers;
  };

  const parseAgg = (): Node => {
    const name = expect("ident").value;
    if (!(name in AGGREGATIONS)) {
      throw new Error(`Unknown function "${name}"`);
    }
    const aggregation = name as MetricAggregation;
    expect("op", "(");
    let property: string | undefined;
    if (aggregationRequiresProperty(aggregation)) {
      const token = peek();
      if (token?.kind !== "ident" && token?.kind !== "str") {
        throw new Error(
          `${aggregation}() needs a property, e.g. ${aggregation}(fps)`
        );
      }
      next();
      property = token.value;
    }
    const matchers = parseMatchers();
    expect("op", ")");
    return { aggregation, matchers, property, type: "agg" };
  };

  const binaryOpAt = (): "+" | "-" | "*" | "/" | null => {
    const token = peek();
    if (token?.kind === "op" && token.value in BINARY_PRECEDENCE) {
      return token.value as "+" | "-" | "*" | "/";
    }
    return null;
  };

  // Precedence-climbing: one self-recursive parser handles unary minus,
  // parentheses, and left-associative binary operators by minimum precedence.
  const parseAt = (minPrecedence: number): Node => {
    const token = peek();
    if (!token) {
      throw new Error("Unexpected end of expression");
    }
    let left: Node;
    if (token.kind === "op" && token.value === "-") {
      next();
      left = { operand: parseAt(UNARY_PRECEDENCE), type: "neg" };
    } else if (token.kind === "op" && token.value === "(") {
      next();
      left = parseAt(0);
      expect("op", ")");
    } else if (token.kind === "num") {
      next();
      left = { type: "number", value: token.value };
    } else if (token.kind === "ident") {
      left = parseAgg();
    } else {
      throw new Error(`Unexpected token "${tokenText(token)}"`);
    }

    let op = binaryOpAt();
    while (op && BINARY_PRECEDENCE[op] >= minPrecedence) {
      next();
      const right = parseAt(BINARY_PRECEDENCE[op] + 1);
      left = { left, op, right, type: "binary" };
      op = binaryOpAt();
    }
    return left;
  };

  const ast = parseAt(0);
  if (pos < tokens.length) {
    throw new Error(`Unexpected token "${tokenText(tokens[pos])}"`);
  }
  return ast;
};

/** Parse an expression into its AST, throwing an `Error` on any syntax error. */
export const parseMetricExpression = (expression: string): Node =>
  parse(tokenize(expression));

export interface CompiledExpression {
  params: Record<string, unknown>;
  valueExpr: string;
}

/**
 * Compile a metric expression into a single ClickHouse scalar expression (the
 * `value` projection) plus its bound params. Reuses {@link buildFilterCondition}
 * and {@link buildPropertyAccessor} so matchers share the query builder's column
 * allowlist and JSON-extraction semantics.
 */
export const compileMetricExpression = (
  expression: string
): CompiledExpression => {
  const ast = parseMetricExpression(expression);
  const params: Record<string, unknown> = {};
  const propertyParams = new Map<string, string>();
  let matcherIndex = 0;

  const buildPredicate = (matchers: Matcher[]): string | null => {
    if (matchers.length === 0) {
      return null;
    }
    const conditions: string[] = [];
    for (const matcher of matchers) {
      const { condition, paramName, paramValue } = buildFilterCondition(
        matcher,
        matcherIndex,
        propertyParams
      );
      matcherIndex += 1;
      conditions.push(condition);
      // `in` / emptiness operators bind a param object rather than a scalar.
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
    return conditions.join(" AND ");
  };

  const emitAgg = (node: AggNode): string => {
    const predicate = buildPredicate(node.matchers);
    let accessor: string | undefined;
    if (aggregationRequiresProperty(node.aggregation)) {
      if (!node.property) {
        throw new Error(`${node.aggregation}() needs a property`);
      }
      accessor = buildPropertyAccessor(node.property, "number", propertyParams);
    }
    return emitAggregation(node.aggregation, { accessor, predicate });
  };

  const emit = (node: Node): string => {
    switch (node.type) {
      case "number": {
        return String(node.value);
      }
      case "neg": {
        return `(-${emit(node.operand)})`;
      }
      case "binary": {
        const left = emit(node.left);
        const right = emit(node.right);
        // Guard division: a zero denominator yields NULL rather than inf/nan.
        if (node.op === "/") {
          return `(${left} / nullIf(${right}, 0))`;
        }
        return `(${left} ${node.op} ${right})`;
      }
      default: {
        return emitAgg(node);
      }
    }
  };

  const valueExpr = emit(ast);
  for (const [property, paramName] of propertyParams) {
    params[paramName] = property;
  }
  return { params, valueExpr };
};

/** Validate an expression for schema refinement: returns an error message or null. */
export const validateMetricExpression = (expression: string): string | null => {
  try {
    parseMetricExpression(expression);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid expression";
  }
};

const quote = (value: unknown): string => `"${String(value)}"`;

/** Render a property name as a bare identifier, or quote it if exotic. */
export const serializeKey = (property: string): string =>
  IDENT_FULL.test(property) ? property : quote(property);

/** Serialize a single filter back to matcher syntax (inverse of the parser). */
export const serializeFilter = (filter: Filter): string => {
  const key = serializeKey(filter.property);
  switch (filter.operator) {
    case "eq": {
      return `${key} = ${quote(filter.value)}`;
    }
    case "neq": {
      return `${key} != ${quote(filter.value)}`;
    }
    case "contains": {
      return `${key} =~ ${quote(filter.value)}`;
    }
    case "not_contains": {
      return `${key} !~ ${quote(filter.value)}`;
    }
    case "starts_with": {
      return `${key} ^= ${quote(filter.value)}`;
    }
    case "gt": {
      return `${key} > ${Number(filter.value)}`;
    }
    case "gte": {
      return `${key} >= ${Number(filter.value)}`;
    }
    case "lt": {
      return `${key} < ${Number(filter.value)}`;
    }
    case "lte": {
      return `${key} <= ${Number(filter.value)}`;
    }
    case "in": {
      const values = Array.isArray(filter.value)
        ? filter.value
        : [String(filter.value)];
      return `${key} in (${values.map(quote).join(", ")})`;
    }
    case "is_empty": {
      return `${key} is empty`;
    }
    default: {
      return `${key} is not empty`;
    }
  }
};
