import type {
  FormulaTerm,
  MetricFormula,
  MetricTerm,
  TermOperator,
} from "@sbox-analytics/api/metric-terms";
import { decodeFormula, encodeFormula } from "@sbox-analytics/api/metric-terms";
import type { MetricConfig } from "@sbox-analytics/api/metrics";
import { metricConfigSchema } from "@sbox-analytics/api/metrics";
import type { Filter } from "@sbox-analytics/api/query-builder";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import { orpc } from "@/utils/orpc";

// Select label maps (the `items` prop renders labels instead of raw values).
export const AGGREGATION_ITEMS = {
  avg: "Average of property",
  count: "Event count",
  max: "Maximum of property",
  min: "Minimum of property",
  sum: "Sum of property",
  uniq_players: "Unique players",
  uniq_sessions: "Unique sessions",
} as const;

export const GRANULARITY_ITEMS = {
  day: "Daily",
  hour: "Hourly",
  month: "Monthly",
  none: "Whole period",
  week: "Weekly",
} as const;

export const OPERATOR_ITEMS = {
  contains: "contains",
  eq: "equals",
  gt: ">",
  gte: ">=",
  in: "is one of",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  lt: "<",
  lte: "<=",
  neq: "does not equal",
  not_contains: "does not contain",
  starts_with: "starts with",
} as const;

export const OPERATOR_ITEMS_LABELS = {
  "*": "× (multiply)",
  "+": "+ (add)",
  "-": "− (subtract)",
  "/": "÷ (ratio)",
} as const satisfies Record<TermOperator, string>;

const PROPERTY_AGGREGATIONS = new Set(["avg", "max", "min", "sum"]);
const QUERY_LIMIT = 1000;
const ALL_EVENTS = "__all__";
const EVENT_TYPE_PROPERTY = "event_type";
const MAX_FILTERS = 10;
const MAX_TERMS = 5;

export type Aggregation = keyof typeof AGGREGATION_ITEMS;
export type Granularity = keyof typeof GRANULARITY_ITEMS;
export type FilterOperator = keyof typeof OPERATOR_ITEMS;

/** Operators whose bound value compares numerically in the query builder. */
const ORDERING_OPERATORS = new Set<FilterOperator>(["gt", "gte", "lt", "lte"]);
/** Operators that take no value input. */
export const VALUELESS_OPERATORS = new Set<FilterOperator>([
  "is_empty",
  "is_not_empty",
]);

/** Map a stored "simple" metric's aggregation onto an expression term agg. */
const SIMPLE_AGGREGATION: Record<string, Aggregation> = {
  unique_players: "uniq_players",
  unique_sessions: "uniq_sessions",
};

export interface FilterDraft {
  id: string;
  operator: FilterOperator;
  property: string;
  value: string;
}

/** The operator joining a term to the running chain; ignored on the first term. */
interface TermBase {
  id: string;
  operator: TermOperator;
}

export interface AggTermDraft extends TermBase {
  kind: "agg";
  /** `ALL_EVENTS`, or a specific event type compiled to an `event_type` match. */
  eventType: string;
  aggregation: Aggregation;
  property: string;
  filters: FilterDraft[];
}

/** A raw constant term (e.g. `100`) held as text while the user types it. */
export interface NumberTermDraft extends TermBase {
  kind: "number";
  value: string;
}

export type TermDraft = AggTermDraft | NumberTermDraft;
export type TermKind = TermDraft["kind"];

let idCounter = 0;
const nextId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
};

const toFilter = (draft: FilterDraft): Filter => {
  if (VALUELESS_OPERATORS.has(draft.operator)) {
    return { operator: draft.operator, property: draft.property, value: "" };
  }
  if (draft.operator === "in") {
    return {
      operator: draft.operator,
      property: draft.property,
      value: draft.value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    };
  }
  if (ORDERING_OPERATORS.has(draft.operator)) {
    return {
      operator: draft.operator,
      property: draft.property,
      value: Number(draft.value),
    };
  }
  return {
    operator: draft.operator,
    property: draft.property,
    value: draft.value,
  };
};

const toFilterDraft = (filter: Filter): FilterDraft => ({
  id: nextId("filter"),
  operator: filter.operator,
  property: filter.property,
  value: Array.isArray(filter.value)
    ? filter.value.join(", ")
    : String(filter.value),
});

const emptyTerm = (operator: TermOperator = "/"): AggTermDraft => ({
  aggregation: "count",
  eventType: ALL_EVENTS,
  filters: [],
  id: nextId("term"),
  kind: "agg",
  operator,
  property: "",
});

const needsProperty = (aggregation: Aggregation): boolean =>
  PROPERTY_AGGREGATIONS.has(aggregation);

/** Compile a term draft to a {@link FormulaTerm}: event picker + filters → matchers. */
const toFormulaTerm = (draft: TermDraft): FormulaTerm => {
  if (draft.kind === "number") {
    return { kind: "number", value: Number(draft.value) };
  }
  const filters: Filter[] = [];
  if (draft.eventType !== ALL_EVENTS) {
    filters.push({
      operator: "eq",
      property: EVENT_TYPE_PROPERTY,
      value: draft.eventType,
    });
  }
  for (const filter of draft.filters) {
    filters.push(toFilter(filter));
  }
  return {
    aggregation: draft.aggregation,
    filters,
    kind: "agg",
    property: needsProperty(draft.aggregation) ? draft.property : "",
  };
};

/** Lift a single `event_type = …` match back into the term's event picker. */
const fromMetricTerm = (
  term: MetricTerm,
  operator: TermOperator
): AggTermDraft => {
  let eventType = ALL_EVENTS;
  let pulledEvent = false;
  const rest: Filter[] = [];
  for (const filter of term.filters) {
    const isEventMatch =
      filter.property === EVENT_TYPE_PROPERTY &&
      filter.operator === "eq" &&
      typeof filter.value === "string";
    if (isEventMatch && !pulledEvent) {
      eventType = filter.value as string;
      pulledEvent = true;
    } else {
      rest.push(filter);
    }
  }
  return {
    aggregation: term.aggregation,
    eventType,
    filters: rest.map(toFilterDraft),
    id: nextId("term"),
    kind: "agg",
    operator,
    property: term.property,
  };
};

/** Reverse of {@link toFormulaTerm}: a decoded term back into an editable draft. */
const fromFormulaTerm = (
  term: FormulaTerm,
  operator: TermOperator
): TermDraft =>
  term.kind === "number"
    ? {
        id: nextId("term"),
        kind: "number",
        operator,
        value: String(term.value),
      }
    : fromMetricTerm(term, operator);

/** Spread a decoded formula's terms + per-gap operators into editable drafts. */
const draftsFromFormula = (formula: MetricFormula): TermDraft[] =>
  formula.terms.map((term, index) =>
    fromFormulaTerm(
      term,
      index === 0 ? "/" : (formula.operators[index - 1] ?? "/")
    )
  );

const termFromSimpleConfig = (config: MetricConfig): AggTermDraft => {
  const aggregation = config.aggregation ?? "count";
  return {
    aggregation:
      SIMPLE_AGGREGATION[aggregation] ?? (aggregation as Aggregation),
    eventType: config.eventType ?? ALL_EVENTS,
    filters: (config.filters ?? []).map(toFilterDraft),
    id: nextId("term"),
    kind: "agg",
    operator: "/",
    property: config.aggregateProperty ?? "",
  };
};

interface FormulaSeed {
  codeOverride: string | null;
  terms: TermDraft[];
}

/** Derive the initial builder state from an existing metric (or defaults). */
const seedFormula = (config?: MetricConfig): FormulaSeed => {
  if (!config) {
    return { codeOverride: null, terms: [emptyTerm()] };
  }
  if (config.expression) {
    const decoded = decodeFormula(config.expression);
    if (decoded) {
      return { codeOverride: null, terms: draftsFromFormula(decoded) };
    }
    // Valid but too complex for the visual builder — keep it in the Code editor.
    return { codeOverride: config.expression, terms: [emptyTerm()] };
  }
  return { codeOverride: null, terms: [termFromSimpleConfig(config)] };
};

export interface MetricBuilderInitial {
  config: MetricConfig;
  description: string | null;
  name: string;
}

export const useMetricBuilder = (
  projectId?: string,
  initial?: MetricBuilderInitial
) => {
  const formId = useId();
  const seed = seedFormula(initial?.config);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [terms, setTerms] = useState<TermDraft[]>(seed.terms);
  const [codeOverride, setCodeOverride] = useState<string | null>(
    seed.codeOverride
  );
  // Granularity + group-by aren't part of the metric — they shape *this*
  // preview only (widgets/alerts pick their own). Start unsliced.
  const [granularity, setGranularity] = useState<Granularity>("none");
  const [groupBy, setGroupBy] = useState<string[]>([]);

  const { data: eventTypes } = useQuery(
    orpc.introspection.eventTypes.queryOptions({
      enabled: Boolean(projectId),
      input: { projectId: projectId ?? "" },
    })
  );

  const eventItems: Record<string, string> = {
    [ALL_EVENTS]: "All events",
    ...Object.fromEntries((eventTypes ?? []).map((type) => [type, type])),
  };

  const isComplex = codeOverride !== null;
  const formula: MetricFormula = {
    // Each term carries its leading operator; the first term's is ignored.
    operators: terms.slice(1).map((term) => term.operator),
    terms: terms.map(toFormulaTerm),
  };
  const expression = isComplex ? (codeOverride ?? "") : encodeFormula(formula);

  // The saved metric is the selector only — no granularity/groupBy/limit.
  const config = {
    expression: expression || undefined,
  };
  const parsed = metricConfigSchema.safeParse(config);

  // The preview's shape params; passed to metrics.preview, never saved.
  const view = {
    granularity,
    groupBy: groupBy.length > 0 ? groupBy : undefined,
    limit: QUERY_LIMIT,
  };

  const addTerm = () => {
    if (terms.length < MAX_TERMS) {
      setTerms([...terms, emptyTerm("/")]);
    }
  };

  const removeTerm = (id: string) => {
    if (terms.length > 1) {
      setTerms(terms.filter((term) => term.id !== id));
    }
  };

  /**
   * Reorder terms (drag-and-drop). Operators belong to their gap, not the term:
   * keep each position's operator fixed and only move the term contents through.
   */
  const reorderTerms = (next: TermDraft[]) => {
    const operatorByPosition = terms.map((term) => term.operator);
    setTerms(
      next.map((term, index) => ({
        ...term,
        operator: operatorByPosition[index] ?? "/",
      }))
    );
  };

  const setTermOperator = (id: string, operator: TermOperator) =>
    setTerms(
      terms.map((term) => (term.id === id ? { ...term, operator } : term))
    );

  /** Convert a term between an aggregation and a raw number, keeping its operator. */
  const setTermKind = (id: string, kind: TermKind) =>
    setTerms(
      terms.map((term) => {
        if (term.id !== id || term.kind === kind) {
          return term;
        }
        return kind === "number"
          ? { id: term.id, kind, operator: term.operator, value: "100" }
          : { ...emptyTerm(term.operator), id: term.id };
      })
    );

  const updateTerm = (
    id: string,
    patch: Partial<Omit<AggTermDraft, "filters" | "id" | "kind">>
  ) =>
    setTerms(
      terms.map((term) =>
        term.id === id && term.kind === "agg" ? { ...term, ...patch } : term
      )
    );

  const updateNumberTerm = (id: string, value: string) =>
    setTerms(
      terms.map((term) =>
        term.id === id && term.kind === "number" ? { ...term, value } : term
      )
    );

  const patchTermFilters = (
    termId: string,
    update: (filters: FilterDraft[]) => FilterDraft[]
  ) =>
    setTerms(
      terms.map((term) =>
        term.id === termId && term.kind === "agg"
          ? { ...term, filters: update(term.filters) }
          : term
      )
    );

  const addTermFilter = (termId: string) =>
    patchTermFilters(termId, (filters) =>
      filters.length >= MAX_FILTERS
        ? filters
        : [
            ...filters,
            { id: nextId("filter"), operator: "eq", property: "", value: "" },
          ]
    );

  const updateTermFilter = (
    termId: string,
    filterId: string,
    patch: Partial<FilterDraft>
  ) =>
    patchTermFilters(termId, (filters) =>
      filters.map((filter) =>
        filter.id === filterId ? { ...filter, ...patch } : filter
      )
    );

  const removeTermFilter = (termId: string, filterId: string) =>
    patchTermFilters(termId, (filters) =>
      filters.filter((filter) => filter.id !== filterId)
    );

  /** Apply Code-editor text: decode into terms when possible, else hold as raw. */
  const applyExpression = (text: string) => {
    const decoded = decodeFormula(text);
    if (decoded) {
      setTerms(draftsFromFormula(decoded));
      setCodeOverride(null);
    } else {
      setCodeOverride(text);
    }
  };

  /** Drop a too-complex expression and return to an empty visual builder. */
  const resetToBuilder = () => {
    setTerms([emptyTerm()]);
    setCodeOverride(null);
  };

  return {
    addTerm,
    addTermFilter,
    applyExpression,
    config,
    description,
    eventItems,
    expression,
    formId,
    granularity,
    groupBy,
    isComplex,
    name,
    parsed,
    removeTerm,
    removeTermFilter,
    reorderTerms,
    resetToBuilder,
    setDescription,
    setGranularity,
    setGroupBy,
    setName,
    setTermKind,
    setTermOperator,
    terms,
    updateNumberTerm,
    updateTerm,
    updateTermFilter,
    view,
  };
};
