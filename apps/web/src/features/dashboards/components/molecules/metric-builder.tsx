import type { TermOperator } from "@sbox-analytics/api/metric-terms";
import type {
  MetricConfig,
  MetricInput,
  MetricSnapshot,
  MetricView,
} from "@sbox-analytics/api/metrics";
import { defaultVisualization } from "@sbox-analytics/api/metrics";
import { Badge } from "@sbox-analytics/ui/components/badge";
import { Button } from "@sbox-analytics/ui/components/button";
import { Input } from "@sbox-analytics/ui/components/input";
import { Label } from "@sbox-analytics/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
} from "@sbox-analytics/ui/components/sortable";
import { Textarea } from "@sbox-analytics/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, GripVertical, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";

import { orpc } from "@/utils/orpc";

import type {
  AggTermDraft,
  Aggregation,
  FilterDraft,
  FilterOperator,
  Granularity,
  NumberTermDraft,
  TermDraft,
  TermKind,
} from "../../lib/use-metric-builder";
import {
  AGGREGATION_ITEMS,
  GRANULARITY_ITEMS,
  OPERATOR_ITEMS,
  OPERATOR_ITEMS_LABELS,
  useMetricBuilder,
  VALUELESS_OPERATORS,
} from "../../lib/use-metric-builder";
import type { MetricRows } from "./metric-result";
import { MetricResult } from "./metric-result";

interface MetricBuilderProps {
  from: string;
  isSaving: boolean;
  /** Existing metric to edit; absent means a fresh metric. */
  metric?: MetricSnapshot;
  onSave: (metric: MetricInput) => void;
  /** Resolved project the preview queries (dashboard project or org pin). */
  projectId?: string;
  submitLabel?: string;
  to: string;
}

const PREVIEW_DEBOUNCE_MS = 500;

/** Top-level event columns offered alongside common property keys. */
const COLUMN_SUGGESTIONS = ["event_type", "player_id", "scene", "session_id"];

const TERM_NEEDS_PROPERTY = new Set<Aggregation>(["avg", "max", "min", "sum"]);

/** Choices in a term's type switch (aggregation vs raw constant). */
const TYPE_ITEMS: Record<TermKind, string> = {
  agg: "Aggregation",
  number: "Raw number",
};

const EXPRESSION_PLACEHOLDER =
  'count({event_type="purchase"}) / count({event_type="add_cart"}) * 100';

const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};

const formatZodError = (error: {
  issues: { message: string; path: PropertyKey[] }[];
}): string =>
  error.issues
    .map((issue) =>
      issue.path.length > 0
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message
    )
    .join("\n");

type MetricBuilderState = ReturnType<typeof useMetricBuilder>;

/** One editable filter within a term: property, operator, value. */
const FilterRow = ({
  builder,
  termId,
  filter,
}: {
  builder: MetricBuilderState;
  termId: string;
  filter: FilterDraft;
}) => {
  const { formId } = builder;
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label="Filter property"
        className="flex-1"
        list={`${formId}-property-keys`}
        onChange={(event) =>
          builder.updateTermFilter(termId, filter.id, {
            property: event.target.value,
          })
        }
        placeholder="property"
        value={filter.property}
      />
      <Select
        items={OPERATOR_ITEMS}
        onValueChange={(value) =>
          value &&
          builder.updateTermFilter(termId, filter.id, {
            operator: value as FilterOperator,
          })
        }
        value={filter.operator}
      >
        <SelectTrigger aria-label="Filter operator" className="w-36 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(OPERATOR_ITEMS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {VALUELESS_OPERATORS.has(filter.operator) ? null : (
        <Input
          aria-label="Filter value"
          className="flex-1"
          onChange={(event) =>
            builder.updateTermFilter(termId, filter.id, {
              value: event.target.value,
            })
          }
          placeholder={filter.operator === "in" ? "a, b, c" : "value"}
          value={filter.value}
        />
      )}
      <Button
        aria-label="Remove filter"
        onClick={() => builder.removeTermFilter(termId, filter.id)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <X />
      </Button>
    </div>
  );
};

/** The aggregation fields: event, statistic, optional property, and filters. */
const AggTermFields = ({
  builder,
  term,
}: {
  builder: MetricBuilderState;
  term: AggTermDraft;
}) => {
  const { formId } = builder;
  const fieldId = `${formId}-term-${term.id}`;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-event`}>Event</Label>
        <Select
          items={builder.eventItems}
          onValueChange={(value) =>
            value && builder.updateTerm(term.id, { eventType: value })
          }
          value={term.eventType}
        >
          <SelectTrigger className="w-full" id={`${fieldId}-event`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(builder.eventItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${fieldId}-aggregation`}>Statistic</Label>
        <Select
          items={AGGREGATION_ITEMS}
          onValueChange={(value) =>
            value &&
            builder.updateTerm(term.id, { aggregation: value as Aggregation })
          }
          value={term.aggregation}
        >
          <SelectTrigger className="w-full" id={`${fieldId}-aggregation`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(AGGREGATION_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {TERM_NEEDS_PROPERTY.has(term.aggregation) ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${fieldId}-property`}>Property</Label>
          <Input
            id={`${fieldId}-property`}
            list={`${formId}-property-keys`}
            onChange={(event) =>
              builder.updateTerm(term.id, { property: event.target.value })
            }
            placeholder="e.g. fps"
            value={term.property}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-sm">Filters</span>
        {term.filters.map((filter) => (
          <FilterRow
            builder={builder}
            filter={filter}
            key={filter.id}
            termId={term.id}
          />
        ))}
        <Button
          className="self-start"
          onClick={() => builder.addTermFilter(term.id)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus />
          Add filter
        </Button>
      </div>
    </>
  );
};

/** The single numeric input for a raw constant term (e.g. 100). */
const NumberTermFields = ({
  builder,
  term,
}: {
  builder: MetricBuilderState;
  term: NumberTermDraft;
}) => {
  const fieldId = `${builder.formId}-term-${term.id}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${fieldId}-number`}>Value</Label>
      <Input
        id={`${fieldId}-number`}
        inputMode="decimal"
        onChange={(event) =>
          builder.updateNumberTerm(term.id, event.target.value)
        }
        placeholder="e.g. 100"
        type="number"
        value={term.value}
      />
    </div>
  );
};

/** Short text shown in a collapsed term's header. */
const termSummary = (builder: MetricBuilderState, term: TermDraft): string => {
  if (term.kind === "number") {
    return term.value || "0";
  }
  const event = builder.eventItems[term.eventType] ?? term.eventType;
  return `${AGGREGATION_ITEMS[term.aggregation]} · ${event}`;
};

/** The type switch that flips a term between an aggregation and a raw number. */
const TermTypeField = ({
  builder,
  term,
}: {
  builder: MetricBuilderState;
  term: TermDraft;
}) => {
  const fieldId = `${builder.formId}-term-${term.id}-type`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>Type</Label>
      <Select
        items={TYPE_ITEMS}
        onValueChange={(value) =>
          value && builder.setTermKind(term.id, value as TermKind)
        }
        value={term.kind}
      >
        <SelectTrigger className="w-full" id={fieldId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(TYPE_ITEMS).map(([value, optionLabel]) => (
            <SelectItem key={value} value={value}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

/** A draggable, collapsible term: an aggregation or a raw number. */
const TermCard = ({
  builder,
  term,
  label,
  canRemove,
}: {
  builder: MetricBuilderState;
  term: TermDraft;
  label: string;
  canRemove: boolean;
}) => {
  const [open, setOpen] = useState(true);
  const fields =
    term.kind === "number" ? (
      <NumberTermFields builder={builder} term={term} />
    ) : (
      <AggTermFields builder={builder} term={term} />
    );
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-1">
        <SortableItemHandle
          aria-label={`Reorder ${label.toLowerCase()}`}
          className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="size-4" />
        </SortableItemHandle>
        <button
          aria-expanded={open}
          className="flex flex-1 items-center gap-1.5 overflow-hidden text-left"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="shrink-0 font-medium text-muted-foreground text-xs">
            {label}
          </span>
          {open ? null : (
            <span className="truncate text-muted-foreground text-xs">
              {termSummary(builder, term)}
            </span>
          )}
        </button>
        {canRemove ? (
          <Button
            aria-label={`Remove ${label.toLowerCase()}`}
            onClick={() => builder.removeTerm(term.id)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="flex flex-col gap-3">
          <TermTypeField builder={builder} term={term} />
          {fields}
        </div>
      ) : null}
    </div>
  );
};

/** Number raw terms "Number"; number aggregation terms sequentially. */
const buildTermLabels = (terms: TermDraft[]): string[] => {
  const labels: string[] = [];
  let aggCount = 0;
  for (const term of terms) {
    if (term.kind === "number") {
      labels.push("Number");
    } else {
      aggCount += 1;
      labels.push(`Term ${aggCount}`);
    }
  }
  return labels;
};

/** The leading operator a term contributes to the chain (hidden on the first). */
const TermOperatorField = ({
  builder,
  term,
  label,
}: {
  builder: MetricBuilderState;
  term: TermDraft;
  label: string;
}) => (
  <Select
    items={OPERATOR_ITEMS_LABELS}
    onValueChange={(value) =>
      value && builder.setTermOperator(term.id, value as TermOperator)
    }
    value={term.operator}
  >
    <SelectTrigger
      aria-label={`Operator before ${label.toLowerCase()}`}
      className="w-44 self-center"
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {Object.entries(OPERATOR_ITEMS_LABELS).map(([value, optionLabel]) => (
        <SelectItem key={value} value={value}>
          {optionLabel}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/** The draggable term list, per-gap operators, and controls to add terms. */
const TermsEditor = ({ builder }: { builder: MetricBuilderState }) => {
  const multipleTerms = builder.terms.length > 1;
  const labels = buildTermLabels(builder.terms);
  return (
    <div className="flex flex-col gap-3">
      <Sortable
        getItemValue={(term: TermDraft) => term.id}
        onValueChange={builder.reorderTerms}
        orientation="vertical"
        value={builder.terms}
      >
        <SortableContent className="flex flex-col gap-3">
          {builder.terms.map((term, index) => (
            // The operator lives in the gap, not the card, so only the card
            // (the SortableItem) drags — the operator stays put.
            <Fragment key={term.id}>
              {index > 0 ? (
                <TermOperatorField
                  builder={builder}
                  label={labels[index] ?? "term"}
                  term={term}
                />
              ) : null}
              <SortableItem value={term.id}>
                <TermCard
                  builder={builder}
                  canRemove={multipleTerms}
                  label={labels[index] ?? "Term"}
                  term={term}
                />
              </SortableItem>
            </Fragment>
          ))}
        </SortableContent>
      </Sortable>

      <Button
        className="self-start"
        onClick={builder.addTerm}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus />
        Add term
      </Button>
    </div>
  );
};

/** Shared group-by chips + property suggestions; owns its own input state. */
const GroupByField = ({
  builder,
  propertySuggestions,
}: {
  builder: MetricBuilderState;
  propertySuggestions: string[];
}) => {
  const { formId } = builder;
  const [groupByInput, setGroupByInput] = useState("");
  const groupByCandidates = propertySuggestions.filter(
    (property) => !builder.groupBy.includes(property)
  );
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${formId}-group-by`}>Group by</Label>
      {builder.groupBy.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {builder.groupBy.map((property) => (
            <Badge key={property} variant="secondary">
              {property}
              <button
                aria-label={`Remove ${property} grouping`}
                className="ml-1"
                onClick={() =>
                  builder.setGroupBy(
                    builder.groupBy.filter((item) => item !== property)
                  )
                }
                type="button"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <Input
        id={`${formId}-group-by`}
        list={`${formId}-property-keys`}
        onChange={(event) => setGroupByInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") {
            return;
          }
          event.preventDefault();
          const property = groupByInput.trim();
          if (property && !builder.groupBy.includes(property)) {
            builder.setGroupBy([...builder.groupBy, property]);
            setGroupByInput("");
          }
        }}
        placeholder="Type a property and press Enter"
        value={groupByInput}
      />
      {groupByCandidates.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {groupByCandidates.slice(0, 8).map((property) => (
            <Button
              key={property}
              onClick={() => builder.setGroupBy([...builder.groupBy, property])}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Plus className="size-3" />
              {property}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

/** Shown on the Builder tab when the expression is too complex to edit visually. */
const ComplexNotice = ({ builder }: { builder: MetricBuilderState }) => (
  <div className="flex flex-col items-start gap-2 rounded-lg border border-border border-dashed p-4">
    <p className="text-muted-foreground text-sm">
      This metric's expression is too complex for the visual builder. Edit it in
      the Code tab, or start over here.
    </p>
    <Button
      onClick={builder.resetToBuilder}
      size="sm"
      type="button"
      variant="outline"
    >
      Start over
    </Button>
  </div>
);

/** A titled, collapsible panel; `onOpenChange` fires on each toggle. */
const CollapsibleSection = ({
  title,
  defaultOpen = true,
  onOpenChange,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
  };
  return (
    <div className="flex flex-col gap-3">
      <button
        aria-expanded={open}
        className="flex items-center gap-1 text-left text-muted-foreground hover:text-foreground"
        onClick={toggle}
        type="button"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <span className="font-medium text-xs uppercase tracking-wide">
          {title}
        </span>
      </button>
      {open ? <div className="flex flex-col gap-4">{children}</div> : null}
    </div>
  );
};

/**
 * The preview: granularity + group-by are *preview-only* controls (the metric
 * doesn't store them), wired to the builder's view, plus the rendered result.
 */
const PreviewSection = ({
  builder,
  isPreviewFetching,
  preview,
  previewView,
  projectId,
}: {
  builder: MetricBuilderState;
  isPreviewFetching: boolean;
  preview: { rows: MetricRows; sql: string } | undefined;
  previewView: MetricView;
  projectId?: string;
}) => {
  const { formId, parsed } = builder;
  return (
    <CollapsibleSection title="Preview">
      <p className="text-muted-foreground text-xs">
        How to slice this preview. Granularity and group-by belong to the widget
        or alert that runs the metric — not the metric itself.
      </p>

      <GroupByField
        builder={builder}
        propertySuggestions={COLUMN_SUGGESTIONS}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-granularity`}>Granularity</Label>
        <Select
          items={GRANULARITY_ITEMS}
          onValueChange={(value) =>
            value && builder.setGranularity(value as Granularity)
          }
          value={builder.granularity}
        >
          <SelectTrigger className="w-full" id={`${formId}-granularity`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(GRANULARITY_ITEMS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {projectId && parsed.success ? (
        <>
          <div className="pointer-events-none select-none">
            {preview ? (
              <MetricResult
                rows={preview.rows}
                title={builder.name.trim() || "Untitled metric"}
                view={previewView}
                visualization={defaultVisualization(previewView)}
              />
            ) : (
              <Skeleton className="h-24 w-full" />
            )}
          </div>
          {preview ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                {isPreviewFetching
                  ? "Generated SQL (refreshing…)"
                  : "Generated SQL"}
              </summary>
              <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono">
                {preview.sql}
              </pre>
            </details>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          Add a valid metric to see a preview.
        </p>
      )}
    </CollapsibleSection>
  );
};

export const MetricBuilder = ({
  from,
  isSaving,
  metric,
  onSave,
  projectId,
  submitLabel = "Save metric",
  to,
}: MetricBuilderProps) => {
  const builder = useMetricBuilder(
    projectId,
    metric
      ? {
          config: metric.config,
          description: metric.description,
          name: metric.name,
        }
      : undefined
  );
  const { formId, parsed } = builder;

  const [codeText, setCodeText] = useState("");

  const codeError = parsed.success ? null : formatZodError(parsed.error);
  // The same error, surfaced under the visual builder (unless it's the Code-only
  // complex case, which the Code tab already explains).
  const builderError = builder.isComplex ? null : codeError;

  const handleCodeChange = (text: string) => {
    setCodeText(text);
    builder.applyExpression(text);
  };

  // Preview re-runs after both the metric and the preview's view settle. The
  // view (granularity/groupBy/limit) is the consumer's, not part of the metric.
  const previewKey = useDebouncedValue(
    parsed.success
      ? JSON.stringify({ config: parsed.data, view: builder.view })
      : null,
    PREVIEW_DEBOUNCE_MS
  );
  const previewArgs = previewKey
    ? (JSON.parse(previewKey) as { config: MetricConfig; view: MetricView })
    : null;
  const previewView = previewArgs?.view ?? builder.view;
  const { data: preview, isFetching: isPreviewFetching } = useQuery(
    orpc.metrics.preview.queryOptions({
      enabled: Boolean(projectId) && previewArgs !== null,
      input: {
        config: previewArgs?.config ?? ({} as MetricConfig),
        projectId: projectId ?? "",
        timeRange: { from, to },
        view: previewView,
      },
    })
  );

  const canSave = parsed.success && builder.name.trim().length > 0 && !isSaving;

  const handleSubmit = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!(parsed.success && canSave)) {
      return;
    }
    onSave({
      config: parsed.data,
      description: builder.description.trim() || undefined,
      name: builder.name.trim(),
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-name`}>Name</Label>
        <Input
          id={`${formId}-name`}
          maxLength={80}
          onChange={(event) => builder.setName(event.target.value)}
          placeholder="e.g. Knife kills"
          value={builder.name}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${formId}-description`}>Description (optional)</Label>
        <Input
          id={`${formId}-description`}
          maxLength={500}
          onChange={(event) => builder.setDescription(event.target.value)}
          placeholder="What this metric measures"
          value={builder.description}
        />
      </div>

      <CollapsibleSection title="Builder">
        {builder.isComplex ? (
          <ComplexNotice builder={builder} />
        ) : (
          <TermsEditor builder={builder} />
        )}

        {builderError ? (
          <p className="whitespace-pre-wrap text-destructive text-xs">
            {builderError}
          </p>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        defaultOpen={false}
        onOpenChange={(open) => open && setCodeText(builder.expression)}
        title="Code"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${formId}-code`}>Expression</Label>
          <Textarea
            className="min-h-32 font-mono text-xs"
            id={`${formId}-code`}
            onChange={(event) => handleCodeChange(event.target.value)}
            placeholder={EXPRESSION_PLACEHOLDER}
            spellCheck={false}
            value={codeText}
          />
          {codeError ? (
            <p className="whitespace-pre-wrap text-destructive text-xs">
              {codeError}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Combine aggregates — count(), uniq_players(), sum(prop) — with{" "}
              {"{}"} matchers (=, !=, =~, &gt;, in, is empty) and + - * /.
            </p>
          )}
        </div>
      </CollapsibleSection>

      <PreviewSection
        builder={builder}
        isPreviewFetching={isPreviewFetching}
        preview={preview}
        previewView={previewView}
        projectId={projectId}
      />

      <datalist id={`${formId}-property-keys`}>
        {COLUMN_SUGGESTIONS.map((property) => (
          <option key={property} value={property}>
            {property}
          </option>
        ))}
      </datalist>

      <Button className="self-end" disabled={!canSave} type="submit">
        {submitLabel}
      </Button>
    </form>
  );
};
