import {
  isPropertyAggregation,
  parseMetricExpression,
  serializeFilter,
  serializeKey,
} from "./metric-expression";
import type { MetricAggregation, Node } from "./metric-expression";
import type { Filter } from "./query-fragments";

// The structured builder's model of a metric: a flat list of terms joined by
// per-gap arithmetic operators. A term is either an aggregation or a raw number
// (so `count(...) / count(...) * 100` is three terms, not a special "percent"
// flag). This is the visual counterpart of the expression text — `encodeFormula`
// renders a formula to text, `decodeFormula` recovers a formula from text (or
// returns null when the expression is too complex for the visual builder, e.g.
// math-precedence nesting that isn't a left-to-right chain, in which case the UI
// falls back to the Code editor). The builder evaluates left to right, so encode
// parenthesises the accumulating left side to keep what you see lossless.

export type TermOperator = "/" | "+" | "-" | "*";

export interface MetricTerm {
  kind: "agg";
  aggregation: MetricAggregation;
  /** Property to aggregate; empty for count / unique aggregations. */
  property: string;
  filters: Filter[];
}

export interface NumberTerm {
  kind: "number";
  value: number;
}

export type FormulaTerm = MetricTerm | NumberTerm;

export interface MetricFormula {
  terms: FormulaTerm[];
  /** Operator joining term[i] and term[i + 1]; length is terms.length - 1. */
  operators: TermOperator[];
}

const encodeTerm = (term: FormulaTerm): string => {
  if (term.kind === "number") {
    return String(term.value);
  }
  const selector =
    term.filters.length > 0
      ? `{${term.filters.map(serializeFilter).join(", ")}}`
      : "";
  const property = isPropertyAggregation(term.aggregation)
    ? serializeKey(term.property)
    : "";
  return `${term.aggregation}(${property}${selector})`;
};

/** Render a formula to its canonical, left-nested expression text. */
export const encodeFormula = (formula: MetricFormula): string => {
  const [first, ...rest] = formula.terms;
  if (!first) {
    return "";
  }
  let text = encodeTerm(first);
  for (const [index, operator] of formula.operators.entries()) {
    const right = rest[index];
    if (!right) {
      break;
    }
    const left = index === 0 ? text : `(${text})`;
    text = `${left} ${operator} ${encodeTerm(right)}`;
  }
  return text;
};

const toFormulaTerm = (node: Node): FormulaTerm | null => {
  if (node.type === "agg") {
    return {
      aggregation: node.aggregation,
      filters: node.matchers,
      kind: "agg",
      property: node.property ?? "",
    };
  }
  if (node.type === "number") {
    return { kind: "number", value: node.value };
  }
  if (node.type === "neg" && node.operand.type === "number") {
    return { kind: "number", value: -node.operand.value };
  }
  return null;
};

/**
 * Flatten a left-nested chain (`((a op b) op c)`) into a flat term list and the
 * operators between them, or null if any leaf isn't a term or the tree isn't
 * left-nested (e.g. math precedence put a binary on the right).
 */
const flatten = (node: Node): MetricFormula | null => {
  const leaf = toFormulaTerm(node);
  if (leaf) {
    return { operators: [], terms: [leaf] };
  }
  if (node.type === "binary") {
    const left = flatten(node.left);
    const right = toFormulaTerm(node.right);
    if (!(left && right)) {
      return null;
    }
    return {
      operators: [...left.operators, node.op],
      terms: [...left.terms, right],
    };
  }
  return null;
};

/** Recover a formula from expression text, or null if too complex to edit visually. */
export const decodeFormula = (expression: string): MetricFormula | null => {
  let ast: Node;
  try {
    ast = parseMetricExpression(expression);
  } catch {
    return null;
  }
  return flatten(ast);
};
