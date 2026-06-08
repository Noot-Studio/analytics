"use client";

import { Badge } from "@sbox-analytics/ui/components/badge";
import { Button } from "@sbox-analytics/ui/components/button";
import { Calendar } from "@sbox-analytics/ui/components/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@sbox-analytics/ui/components/command";
import {
  Faceted,
  FacetedBadgeList,
  FacetedContent,
  FacetedEmpty,
  FacetedGroup,
  FacetedInput,
  FacetedItem,
  FacetedList,
  FacetedTrigger,
} from "@sbox-analytics/ui/components/faceted";
import { Input } from "@sbox-analytics/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@sbox-analytics/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sbox-analytics/ui/components/select";
import { Separator } from "@sbox-analytics/ui/components/separator";
import { cn } from "@sbox-analytics/ui/lib/utils";
import type { Column, ColumnMeta, Table } from "@tanstack/react-table";
import {
  CalendarIcon,
  Check,
  ChevronDown,
  Diamond,
  Hash,
  ListFilter,
  Plus,
  ToggleLeft,
  Type,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { DataTableRangeFilter } from "@/components/data-table/data-table-range-filter";
import { dataTableConfig } from "@/config/data-table";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useQueryState } from "@/hooks/use-query-state";
import { getDefaultFilterOperator, getFilterOperators } from "@/lib/data-table";
import { formatDate } from "@/lib/format";
import { generateId } from "@/lib/id";
import { getFiltersStateParser } from "@/lib/parsers";
import { parseAsStringEnum } from "@/lib/query-params";
import type {
  ExtendedColumnFilter,
  FilterOperator,
  FilterVariant,
  JoinOperator,
} from "@/types/data-table";

const DEBOUNCE_MS = 300;
const THROTTLE_MS = 50;
const FILTER_SHORTCUT_KEY = "f";
const REMOVE_FILTER_SHORTCUTS = new Set(["backspace", "delete"]);

const FILTER_VARIANT_ICONS: Record<FilterVariant, LucideIcon> = {
  boolean: ToggleLeft,
  date: CalendarIcon,
  dateRange: CalendarIcon,
  multiSelect: Diamond,
  number: Hash,
  range: Hash,
  select: Diamond,
  text: Type,
};

interface FilterInputRenderProps<TData> {
  filter: ExtendedColumnFilter<TData>;
  inputId: string;
  column: Column<TData>;
  columnMeta?: ColumnMeta<TData, unknown>;
  onFilterUpdate: (
    filterId: string,
    updates: Partial<Omit<ExtendedColumnFilter<TData>, "filterId">>
  ) => void;
  showValueSelector: boolean;
  setShowValueSelector: (value: boolean) => void;
}

const renderTextFilterInput = <TData,>({
  filter,
  inputId,
  column,
  columnMeta,
  onFilterUpdate,
}: FilterInputRenderProps<TData>) => {
  if (filter.operator === "isBetween") {
    return (
      <DataTableRangeFilter
        filter={filter}
        column={column}
        inputId={inputId}
        onFilterUpdate={onFilterUpdate}
      />
    );
  }

  const isNumber = filter.variant === "number" || filter.variant === "range";

  return (
    <Input
      id={inputId}
      type={isNumber ? "number" : filter.variant}
      aria-label={`${columnMeta?.label} filter value`}
      aria-describedby={`${inputId}-description`}
      inputMode={isNumber ? "numeric" : undefined}
      placeholder={columnMeta?.placeholder ?? "Enter value..."}
      className="h-8 w-full rounded"
      defaultValue={typeof filter.value === "string" ? filter.value : undefined}
      onChange={(event) =>
        onFilterUpdate(filter.filterId, {
          value: event.target.value,
        })
      }
    />
  );
};

const renderBooleanFilterInput = <TData,>({
  filter,
  inputId,
  columnMeta,
  onFilterUpdate,
  showValueSelector,
  setShowValueSelector,
}: FilterInputRenderProps<TData>) => {
  if (Array.isArray(filter.value)) {
    return null;
  }

  const inputListboxId = `${inputId}-listbox`;

  return (
    <Select
      open={showValueSelector}
      onOpenChange={setShowValueSelector}
      value={filter.value ?? undefined}
      onValueChange={(value, _) => {
        if (value !== null) {
          onFilterUpdate(filter.filterId, { value });
        }
      }}
    >
      <SelectTrigger
        id={inputId}
        aria-controls={inputListboxId}
        aria-label={`${columnMeta?.label} boolean filter`}
        size="sm"
        className="w-full rounded"
      >
        <SelectValue placeholder={filter.value ? "True" : "False"} />
      </SelectTrigger>
      <SelectContent id={inputListboxId}>
        <SelectItem value="true">True</SelectItem>
        <SelectItem value="false">False</SelectItem>
      </SelectContent>
    </Select>
  );
};

const renderSelectFilterInput = <TData,>({
  filter,
  inputId,
  columnMeta,
  onFilterUpdate,
  showValueSelector,
  setShowValueSelector,
}: FilterInputRenderProps<TData>) => {
  const inputListboxId = `${inputId}-listbox`;

  const multiple = filter.variant === "multiSelect";
  let selectedValues: string | string[] | undefined;
  if (multiple) {
    selectedValues = Array.isArray(filter.value) ? filter.value : [];
  } else {
    selectedValues =
      typeof filter.value === "string" ? filter.value : undefined;
  }

  return (
    <Faceted
      open={showValueSelector}
      onOpenChange={setShowValueSelector}
      value={selectedValues}
      onValueChange={(value) => {
        onFilterUpdate(filter.filterId, {
          value,
        });
      }}
      multiple={multiple}
    >
      <FacetedTrigger
        render={
          <Button
            id={inputId}
            aria-controls={inputListboxId}
            aria-label={`${columnMeta?.label} filter value${multiple ? "s" : ""}`}
            variant="outline"
            size="sm"
            className="w-full rounded font-normal"
          />
        }
      >
        <FacetedBadgeList
          options={columnMeta?.options}
          placeholder={
            columnMeta?.placeholder ?? `Select option${multiple ? "s" : ""}...`
          }
        />
      </FacetedTrigger>
      <FacetedContent id={inputListboxId} className="w-[200px]">
        <FacetedInput
          aria-label={`Search ${columnMeta?.label} options`}
          placeholder={columnMeta?.placeholder ?? "Search options..."}
        />
        <FacetedList>
          <FacetedEmpty>No options found.</FacetedEmpty>
          <FacetedGroup>
            {columnMeta?.options?.map((option) => (
              <FacetedItem key={option.value} value={option.value}>
                {option.icon && <option.icon />}
                <span>{option.label}</span>
                {option.count && (
                  <span className="ml-auto font-mono text-xs">
                    {option.count}
                  </span>
                )}
              </FacetedItem>
            ))}
          </FacetedGroup>
        </FacetedList>
      </FacetedContent>
    </Faceted>
  );
};

const renderDateFilterInput = <TData,>({
  filter,
  inputId,
  columnMeta,
  onFilterUpdate,
  showValueSelector,
  setShowValueSelector,
}: FilterInputRenderProps<TData>) => {
  const inputListboxId = `${inputId}-listbox`;

  const dateValue = Array.isArray(filter.value)
    ? filter.value.filter(Boolean)
    : [filter.value, filter.value].filter(Boolean);

  const startDate = dateValue[0] ? new Date(Number(dateValue[0])) : undefined;
  const endDate = dateValue[1] ? new Date(Number(dateValue[1])) : undefined;

  const isSameDate =
    startDate && endDate && startDate.toDateString() === endDate.toDateString();

  const isBetweenRange =
    filter.operator === "isBetween" && dateValue.length === 2 && !isSameDate;
  let displayValue = "Pick a date";
  if (isBetweenRange) {
    displayValue = `${formatDate(startDate, { month: "short" })} - ${formatDate(endDate, { month: "short" })}`;
  } else if (startDate) {
    displayValue = formatDate(startDate, { month: "short" });
  }

  return (
    <Popover open={showValueSelector} onOpenChange={setShowValueSelector}>
      <PopoverTrigger
        render={
          <Button
            id={inputId}
            aria-controls={inputListboxId}
            aria-label={`${columnMeta?.label} date filter`}
            variant="outline"
            size="sm"
            className={cn(
              "w-full justify-start rounded text-left font-normal",
              !filter.value && "text-muted-foreground"
            )}
          />
        }
      >
        <CalendarIcon />
        <span className="truncate">{displayValue}</span>
      </PopoverTrigger>
      <PopoverContent id={inputListboxId} align="start" className="w-auto p-0">
        {filter.operator === "isBetween" ? (
          <Calendar
            aria-label={`Select ${columnMeta?.label} date range`}
            autoFocus
            captionLayout="dropdown"
            mode="range"
            selected={
              dateValue.length === 2
                ? {
                    from: new Date(Number(dateValue[0])),
                    to: new Date(Number(dateValue[1])),
                  }
                : {
                    from: new Date(),
                    to: new Date(),
                  }
            }
            onSelect={(date) => {
              onFilterUpdate(filter.filterId, {
                value: date
                  ? [
                      (date.from?.getTime() ?? "").toString(),
                      (date.to?.getTime() ?? "").toString(),
                    ]
                  : [],
              });
            }}
          />
        ) : (
          <Calendar
            aria-label={`Select ${columnMeta?.label} date`}
            autoFocus
            captionLayout="dropdown"
            mode="single"
            selected={dateValue[0] ? new Date(Number(dateValue[0])) : undefined}
            onSelect={(date) => {
              onFilterUpdate(filter.filterId, {
                value: (date?.getTime() ?? "").toString(),
              });
              setShowValueSelector(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};

const renderEmptyFilterInput = <TData,>({
  filter,
  inputId,
  columnMeta,
}: FilterInputRenderProps<TData>) => (
  <div
    id={inputId}
    role="status"
    aria-label={`${columnMeta?.label} filter is ${
      filter.operator === "isEmpty" ? "empty" : "not empty"
    }`}
    aria-live="polite"
    className="h-8 w-full rounded border bg-transparent dark:bg-input/30"
  />
);

const onFilterInputRender = <TData,>(props: FilterInputRenderProps<TData>) => {
  const { filter } = props;

  if (filter.operator === "isEmpty" || filter.operator === "isNotEmpty") {
    return renderEmptyFilterInput(props);
  }

  switch (filter.variant) {
    case "text":
    case "number":
    case "range": {
      return renderTextFilterInput(props);
    }
    case "boolean": {
      return renderBooleanFilterInput(props);
    }
    case "select":
    case "multiSelect": {
      return renderSelectFilterInput(props);
    }
    case "date":
    case "dateRange": {
      return renderDateFilterInput(props);
    }
    default: {
      return null;
    }
  }
};

interface DataTableFilterItemProps<TData> {
  filter: ExtendedColumnFilter<TData>;
  index: number;
  filterItemId: string;
  joinOperator: JoinOperator;
  setJoinOperator: (value: JoinOperator) => void;
  columns: Column<TData>[];
  onFilterUpdate: (
    filterId: string,
    updates: Partial<Omit<ExtendedColumnFilter<TData>, "filterId">>
  ) => void;
  onFilterRemove: (filterId: string) => void;
}

const DataTableFilterItem = <TData,>({
  filter,
  index,
  filterItemId,
  joinOperator,
  setJoinOperator,
  columns,
  onFilterUpdate,
  onFilterRemove,
}: DataTableFilterItemProps<TData>) => {
  const [showFieldSelector, setShowFieldSelector] = React.useState(false);
  const [showOperatorSelector, setShowOperatorSelector] = React.useState(false);
  const [showValueSelector, setShowValueSelector] = React.useState(false);

  const column = columns.find((col) => col.id === filter.id);

  const joinOperatorListboxId = `${filterItemId}-join-operator-listbox`;
  const fieldListboxId = `${filterItemId}-field-listbox`;
  const operatorListboxId = `${filterItemId}-operator-listbox`;
  const inputId = `${filterItemId}-input`;

  const columnMeta = column?.columnDef.meta;
  const filterOperators = getFilterOperators(filter.variant);
  const FieldIcon = FILTER_VARIANT_ICONS[filter.variant] ?? Type;

  const onItemKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLLIElement>) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (showFieldSelector || showOperatorSelector || showValueSelector) {
        return;
      }

      if (REMOVE_FILTER_SHORTCUTS.has(event.key.toLowerCase())) {
        event.preventDefault();
        onFilterRemove(filter.filterId);
      }
    },
    [
      filter.filterId,
      showFieldSelector,
      showOperatorSelector,
      showValueSelector,
      onFilterRemove,
    ]
  );

  if (!column) {
    return null;
  }

  let joinOperatorControl = (
    <span className="text-muted-foreground text-sm">{joinOperator}</span>
  );
  if (index === 0) {
    joinOperatorControl = (
      <span className="text-muted-foreground text-sm">Where</span>
    );
  } else if (index === 1) {
    joinOperatorControl = (
      <Select
        value={joinOperator}
        onValueChange={(value, _) =>
          value !== null && setJoinOperator(value as JoinOperator)
        }
      >
        <SelectTrigger
          aria-label="Select join operator"
          aria-controls={joinOperatorListboxId}
          size="sm"
          className="w-full rounded lowercase"
        >
          <SelectValue placeholder={joinOperator} />
        </SelectTrigger>
        <SelectContent className="min-w-(--radix-select-trigger-width) lowercase">
          {dataTableConfig.joinOperators.map((joinOp) => (
            <SelectItem key={joinOp} value={joinOp}>
              {joinOp}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- keyboard shortcut (delete/backspace) removes the filter row; the handler must live on the row container
    <li
      id={filterItemId}
      tabIndex={-1}
      className="flex items-center gap-2"
      onKeyDown={onItemKeyDown}
    >
      <div className="flex w-16 shrink-0 items-center">
        {joinOperatorControl}
      </div>
      <Popover open={showFieldSelector} onOpenChange={setShowFieldSelector}>
        <PopoverTrigger
          render={
            <Button
              aria-controls={fieldListboxId}
              variant="outline"
              size="sm"
              className="w-36 justify-between rounded font-normal"
            />
          }
        >
          <FieldIcon className="text-muted-foreground" />
          <span className="flex-1 truncate text-left">
            {columns.find((col) => col.id === filter.id)?.columnDef.meta
              ?.label ?? "Select field"}
          </span>
          <ChevronDown className="opacity-50" />
        </PopoverTrigger>
        <PopoverContent id={fieldListboxId} align="start" className="w-40 p-0">
          <Command>
            <CommandInput placeholder="Search fields..." />
            <CommandList>
              <CommandEmpty>No fields found.</CommandEmpty>
              <CommandGroup>
                {columns.map((col) => (
                  <CommandItem
                    key={col.id}
                    value={col.id}
                    onSelect={(value) => {
                      onFilterUpdate(filter.filterId, {
                        id: value as Extract<keyof TData, string>,
                        operator: getDefaultFilterOperator(
                          col.columnDef.meta?.variant ?? "text"
                        ),
                        value: "",
                        variant: col.columnDef.meta?.variant ?? "text",
                      });

                      setShowFieldSelector(false);
                    }}
                  >
                    <span className="truncate">
                      {col.columnDef.meta?.label}
                    </span>
                    <Check
                      className={cn(
                        "ml-auto",
                        col.id === filter.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Select
        items={filterOperators}
        open={showOperatorSelector}
        onOpenChange={setShowOperatorSelector}
        value={filter.operator}
        onValueChange={(value, _) => {
          if (value !== null) {
            onFilterUpdate(filter.filterId, {
              operator: value as FilterOperator,
              value:
                value === "isEmpty" || value === "isNotEmpty"
                  ? ""
                  : filter.value,
            });
          }
        }}
      >
        <SelectTrigger
          aria-controls={operatorListboxId}
          size="sm"
          className="w-32 rounded lowercase"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent id={operatorListboxId}>
          {filterOperators.map((operator) => (
            <SelectItem
              key={operator.value}
              value={operator.value}
              className="lowercase"
            >
              {operator.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="min-w-36 max-w-60 flex-1">
        {onFilterInputRender({
          column,
          columnMeta,
          filter,
          inputId,
          onFilterUpdate,
          setShowValueSelector,
          showValueSelector,
        })}
      </div>
      <Button
        aria-controls={filterItemId}
        aria-label="Remove filter"
        variant="ghost"
        size="icon"
        onClick={() => onFilterRemove(filter.filterId)}
      >
        <X />
      </Button>
    </li>
  );
};

interface DataTableFilterListProps<TData> extends React.ComponentProps<
  typeof PopoverContent
> {
  table: Table<TData>;
  debounceMs?: number;
  throttleMs?: number;
  shallow?: boolean;
  disabled?: boolean;
}

export const DataTableFilterList = <TData,>({
  table,
  debounceMs = DEBOUNCE_MS,
  throttleMs = THROTTLE_MS,
  shallow = true,
  disabled,
  ...props
}: DataTableFilterListProps<TData>) => {
  const id = React.useId();
  const labelId = React.useId();
  const descriptionId = React.useId();
  const [open, setOpen] = React.useState(false);
  const addButtonRef = React.useRef<HTMLButtonElement>(null);

  const columns = React.useMemo(
    () =>
      table
        .getAllColumns()
        .filter((column) => column.columnDef.enableColumnFilter),
    [table]
  );

  const [filters, setFilters] = useQueryState(
    table.options.meta?.queryKeys?.filters ?? "filters",
    getFiltersStateParser<TData>(columns.map((field) => field.id))
      .withOptions({
        clearOnDefault: true,
        shallow,
        throttleMs,
      })
      .withDefault([])
  );
  const debouncedSetFilters = useDebouncedCallback(setFilters, debounceMs);

  const [joinOperator, setJoinOperator] = useQueryState(
    table.options.meta?.queryKeys?.joinOperator ?? "",
    parseAsStringEnum(["and", "or"] as const)
      .withOptions({ clearOnDefault: true, shallow })
      .withDefault("and")
  );

  const onFilterAdd = React.useCallback(() => {
    const [column] = columns;

    if (!column) {
      return;
    }

    debouncedSetFilters([
      ...filters,
      {
        filterId: generateId({ length: 8 }),
        id: column.id as Extract<keyof TData, string>,
        operator: getDefaultFilterOperator(
          column.columnDef.meta?.variant ?? "text"
        ),
        value: "",
        variant: column.columnDef.meta?.variant ?? "text",
      },
    ]);
  }, [columns, filters, debouncedSetFilters]);

  const onFilterUpdate = React.useCallback(
    (
      filterId: string,
      updates: Partial<Omit<ExtendedColumnFilter<TData>, "filterId">>
    ) => {
      debouncedSetFilters((prevFilters) => {
        const updatedFilters = prevFilters.map((filter) => {
          if (filter.filterId === filterId) {
            return { ...filter, ...updates } as ExtendedColumnFilter<TData>;
          }
          return filter;
        });
        return updatedFilters;
      });
    },
    [debouncedSetFilters]
  );

  const onFilterRemove = React.useCallback(
    (filterId: string) => {
      const updatedFilters = filters.filter(
        (filter) => filter.filterId !== filterId
      );
      void setFilters(updatedFilters);
      requestAnimationFrame(() => {
        addButtonRef.current?.focus();
      });
    },
    [filters, setFilters]
  );

  const onFiltersReset = React.useCallback(() => {
    void setFilters(null);
    void setJoinOperator("and");
  }, [setFilters, setJoinOperator]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement &&
          event.target.contentEditable === "true")
      ) {
        return;
      }

      if (
        event.key.toLowerCase() === FILTER_SHORTCUT_KEY &&
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey
      ) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onTriggerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (
        REMOVE_FILTER_SHORTCUTS.has(event.key.toLowerCase()) &&
        filters.length > 0
      ) {
        event.preventDefault();
        onFilterRemove(filters.at(-1)?.filterId ?? "");
      }
    },
    [filters, onFilterRemove]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="font-normal"
            onKeyDown={onTriggerKeyDown}
            disabled={disabled}
          />
        }
      >
        <ListFilter className="text-muted-foreground" />
        Filter
        {filters.length > 0 && (
          <Badge
            variant="secondary"
            className="h-[18.24px] rounded-[3.2px] px-[5.12px] font-mono font-normal text-[10.4px]"
          >
            {filters.length}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent
        aria-describedby={descriptionId}
        aria-labelledby={labelId}
        className="flex w-full max-w-(--radix-popover-content-available-width) flex-col gap-0 overflow-hidden p-0 sm:min-w-[440px]"
        {...props}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h4
            id={labelId}
            className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
          >
            Filter
          </h4>
          {filters.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="-my-1 h-auto px-1.5 py-1 font-normal text-muted-foreground"
              onClick={onFiltersReset}
            >
              Clear
            </Button>
          )}
        </div>
        <Separator />
        <p id={descriptionId} className="sr-only">
          {filters.length > 0
            ? "Modify filters to refine your rows."
            : "Add filters to refine your rows."}
        </p>
        {filters.length > 0 ? (
          <ul className="flex max-h-[300px] flex-col gap-2 overflow-y-auto p-3">
            {filters.map((filter, index) => (
              <DataTableFilterItem<TData>
                key={filter.filterId}
                filter={filter}
                index={index}
                filterItemId={`${id}-filter-${filter.filterId}`}
                joinOperator={joinOperator}
                setJoinOperator={setJoinOperator}
                columns={columns}
                onFilterUpdate={onFilterUpdate}
                onFilterRemove={onFilterRemove}
              />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-muted-foreground text-sm">
            No filters applied — all rows shown.
          </p>
        )}
        <Separator />
        <div className="bg-muted/30 px-2 py-1.5">
          <Button
            size="sm"
            variant="link"
            ref={addButtonRef}
            onClick={onFilterAdd}
          >
            <Plus />
            Add filter
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
