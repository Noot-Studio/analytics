"use client";

import { Badge } from "@sbox-analytics/ui/components/badge";
import { Button } from "@sbox-analytics/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@sbox-analytics/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@sbox-analytics/ui/components/popover";
import { Separator } from "@sbox-analytics/ui/components/separator";
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
} from "@sbox-analytics/ui/components/sortable";
import { cn } from "@sbox-analytics/ui/lib/utils";
import type { ColumnSort, Table } from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  CalendarIcon,
  Check,
  ChevronDown,
  Diamond,
  GripVertical,
  Hash,
  Plus,
  ToggleLeft,
  Type,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

import type { FilterVariant } from "@/types/data-table";

const SORT_SHORTCUT_KEY = "s";
const REMOVE_SORT_SHORTCUTS = new Set(["backspace", "delete"]);

const SORT_VARIANT_ICONS: Record<FilterVariant, LucideIcon> = {
  boolean: ToggleLeft,
  date: CalendarIcon,
  dateRange: CalendarIcon,
  multiSelect: Diamond,
  number: Hash,
  range: Hash,
  select: Diamond,
  text: Type,
};

function getSortDirectionLabel(variant: FilterVariant, desc: boolean): string {
  if (variant === "date" || variant === "dateRange") {
    return desc ? "Newest → Oldest" : "Oldest → Newest";
  }
  if (variant === "number" || variant === "range") {
    return desc ? "9 → 0" : "0 → 9";
  }
  return desc ? "Z → A" : "A → Z";
}

interface SortColumn {
  id: string;
  label: string;
  variant: FilterVariant;
}

interface DataTableSortListProps<TData> extends React.ComponentProps<
  typeof PopoverContent
> {
  table: Table<TData>;
  disabled?: boolean;
}

export function DataTableSortList<TData>({
  table,
  disabled,
  ...props
}: DataTableSortListProps<TData>) {
  const id = React.useId();
  const labelId = React.useId();
  const descriptionId = React.useId();
  const [open, setOpen] = React.useState(false);

  const { sorting } = table.getState();
  const onSortingChange = table.setSorting;

  const { columnMeta, columns } = React.useMemo(() => {
    const meta = new Map<string, SortColumn>();
    const sortingIds = new Set(sorting.map((s) => s.id));
    const availableColumns: SortColumn[] = [];

    for (const column of table.getAllColumns()) {
      if (!column.getCanSort()) {
        continue;
      }

      const entry: SortColumn = {
        id: column.id,
        label: column.columnDef.meta?.label ?? column.id,
        variant: column.columnDef.meta?.variant ?? "text",
      };
      meta.set(column.id, entry);

      if (!sortingIds.has(column.id)) {
        availableColumns.push(entry);
      }
    }

    return { columnMeta: meta, columns: availableColumns };
  }, [sorting, table]);

  const onSortAdd = React.useCallback(() => {
    const firstColumn = columns[0];
    if (!firstColumn) {
      return;
    }

    onSortingChange((prevSorting) => [
      ...prevSorting,
      {
        desc:
          firstColumn.variant === "date" || firstColumn.variant === "dateRange",
        id: firstColumn.id,
      },
    ]);
  }, [columns, onSortingChange]);

  const onSortUpdate = React.useCallback(
    (sortId: string, updates: Partial<ColumnSort>) => {
      onSortingChange((prevSorting) => {
        if (!prevSorting) {
          return prevSorting;
        }
        return prevSorting.map((sort) =>
          sort.id === sortId ? { ...sort, ...updates } : sort
        );
      });
    },
    [onSortingChange]
  );

  const onSortRemove = React.useCallback(
    (sortId: string) => {
      onSortingChange((prevSorting) =>
        prevSorting.filter((item) => item.id !== sortId)
      );
    },
    [onSortingChange]
  );

  const onSortingReset = React.useCallback(
    () => onSortingChange(table.initialState.sorting),
    [onSortingChange, table.initialState.sorting]
  );

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement &&
          event.target.contentEditable === "true")
      ) {
        return;
      }

      if (
        event.key.toLowerCase() === SORT_SHORTCUT_KEY &&
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey
      ) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onTriggerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (
        REMOVE_SORT_SHORTCUTS.has(event.key.toLowerCase()) &&
        sorting.length > 0
      ) {
        event.preventDefault();
        onSortingReset();
      }
    },
    [sorting.length, onSortingReset]
  );

  return (
    <Sortable
      value={sorting}
      onValueChange={onSortingChange}
      getItemValue={(item) => item.id}
    >
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
          <ArrowDownUp className="text-muted-foreground" />
          Sort
          {sorting.length > 0 && (
            <Badge
              variant="secondary"
              className="h-[18.24px] rounded-[3.2px] px-[5.12px] font-mono font-normal text-[10.4px]"
            >
              {sorting.length}
            </Badge>
          )}
        </PopoverTrigger>
        <PopoverContent
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          align="start"
          className="flex w-full max-w-(--radix-popover-content-available-width) flex-col gap-0 overflow-hidden p-0 sm:min-w-[460px]"
          {...props}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <h4
              id={labelId}
              className="font-medium text-muted-foreground text-xs uppercase tracking-wide"
            >
              Sort
            </h4>
            {sorting.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="-my-1 h-auto px-1.5 py-1 font-normal text-muted-foreground"
                onClick={onSortingReset}
              >
                Clear
              </Button>
            )}
          </div>
          <Separator />
          <p id={descriptionId} className="sr-only">
            {sorting.length > 0
              ? "Modify sorting to organize your rows."
              : "Add sorting to organize your rows."}
          </p>
          {sorting.length > 0 ? (
            <SortableContent
              role="list"
              className="flex max-h-[300px] flex-col gap-2 overflow-y-auto p-4"
            >
              {sorting.map((sort, index) => (
                <DataTableSortItem
                  key={sort.id}
                  sort={sort}
                  index={index}
                  sortItemId={`${id}-sort-${sort.id}`}
                  column={columnMeta.get(sort.id)}
                  columns={columns}
                  onSortUpdate={onSortUpdate}
                  onSortRemove={onSortRemove}
                />
              ))}
            </SortableContent>
          ) : (
            <p className="px-4 py-4 text-muted-foreground text-sm">
              No sort applied — default order.
            </p>
          )}
          <Separator />
          <div className="bg-muted/30 px-2 py-1.5">
            <Button
              size="sm"
              variant="link"
              onClick={onSortAdd}
              disabled={columns.length === 0}
            >
              <Plus />
              Add sort
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <SortableOverlay>
        <div className="h-[46px] rounded-md border bg-muted/60" />
      </SortableOverlay>
    </Sortable>
  );
}

interface DataTableSortItemProps {
  sort: ColumnSort;
  index: number;
  sortItemId: string;
  column?: SortColumn;
  columns: SortColumn[];
  onSortUpdate: (sortId: string, updates: Partial<ColumnSort>) => void;
  onSortRemove: (sortId: string) => void;
}

function DataTableSortItem({
  sort,
  index,
  sortItemId,
  column,
  columns,
  onSortUpdate,
  onSortRemove,
}: DataTableSortItemProps) {
  const fieldListboxId = `${sortItemId}-field-listbox`;
  const fieldTriggerId = `${sortItemId}-field-trigger`;

  const [showFieldSelector, setShowFieldSelector] = React.useState(false);

  const variant = column?.variant ?? "text";
  const FieldIcon = SORT_VARIANT_ICONS[variant] ?? Type;

  const onItemKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (showFieldSelector) {
        return;
      }

      if (REMOVE_SORT_SHORTCUTS.has(event.key.toLowerCase())) {
        event.preventDefault();
        onSortRemove(sort.id);
      }
    },
    [sort.id, showFieldSelector, onSortRemove]
  );

  return (
    <SortableItem
      value={sort.id}
      role="listitem"
      id={sortItemId}
      tabIndex={-1}
      className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-2"
      onKeyDown={onItemKeyDown}
    >
      <SortableItemHandle
        aria-label="Drag to reorder priority"
        className="flex cursor-grab text-muted-foreground/60 transition-colors hover:text-muted-foreground"
      >
        <GripVertical className="size-4" />
      </SortableItemHandle>
      <span className="w-14 shrink-0 text-muted-foreground text-sm">
        {index === 0 ? "Sort by" : "then by"}
      </span>
      <Popover open={showFieldSelector} onOpenChange={setShowFieldSelector}>
        <PopoverTrigger
          render={
            <Button
              id={fieldTriggerId}
              aria-controls={fieldListboxId}
              variant="outline"
              size="sm"
              className="w-40 justify-between rounded"
            />
          }
        >
          <FieldIcon className="text-muted-foreground" />
          <span className="flex-1 truncate text-left">{column?.label}</span>
          <ChevronDown className="opacity-50" />
        </PopoverTrigger>
        <PopoverContent id={fieldListboxId} align="start" className="w-44 p-0">
          <Command>
            <CommandInput placeholder="Search fields..." />
            <CommandList>
              <CommandEmpty>No fields found.</CommandEmpty>
              <CommandGroup>
                {columns.map((item) => {
                  const ItemIcon = SORT_VARIANT_ICONS[item.variant] ?? Type;
                  return (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={(value) => {
                        onSortUpdate(sort.id, { id: value });
                        setShowFieldSelector(false);
                      }}
                    >
                      <ItemIcon className="text-muted-foreground" />
                      <span className="truncate">{item.label}</span>
                      <Check
                        className={cn(
                          "ml-auto",
                          item.id === sort.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        aria-label={`Toggle ${column?.label} sort direction`}
        variant="outline"
        size="sm"
        className="rounded"
        onClick={() => onSortUpdate(sort.id, { desc: !sort.desc })}
      >
        {sort.desc ? (
          <ArrowDown className="text-primary" />
        ) : (
          <ArrowUp className="text-primary" />
        )}
        {getSortDirectionLabel(variant, sort.desc)}
      </Button>
      <div className="flex-1" />
      <Button
        aria-controls={sortItemId}
        aria-label="Remove sort"
        variant="ghost"
        size="icon"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onSortRemove(sort.id)}
      >
        <X />
      </Button>
    </SortableItem>
  );
}
