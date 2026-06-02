import { Button } from "@sbox-analytics/ui/components/button";
import { Calendar } from "@sbox-analytics/ui/components/calendar";
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
import { cn } from "@sbox-analytics/ui/lib/utils";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { TIME_PRESET_LABELS, TIME_PRESETS } from "../../lib/filters";
import type { TimePreset } from "../../lib/filters";
import { useAnalyticsFilters } from "../../lib/use-analytics-filters";

const CUSTOM_VALUE = "custom";

/**
 * Shared time-range control for every analytics table and chart. Presets cover
 * the common windows; "Custom range" opens a calendar for an arbitrary span.
 * Reads/writes the URL via {@link useAnalyticsFilters}.
 */
export const TimeRangeFilter = ({ className }: { className?: string }) => {
  const { range, from, to, customFrom, customTo, setRange } =
    useAnalyticsFilters();
  const [open, setOpen] = useState(false);

  const selectedRange: DateRange | undefined =
    range === CUSTOM_VALUE
      ? { from: new Date(customFrom ?? from), to: new Date(customTo ?? to) }
      : undefined;

  const onSelectPreset = (value: string | null) => {
    if (!value) {
      return;
    }
    if (value === CUSTOM_VALUE) {
      // Seed the custom span from the currently resolved window.
      setRange(CUSTOM_VALUE, from, to);
      setOpen(true);
      return;
    }
    setRange(value as TimePreset);
  };

  const onSelectDates = (next: DateRange | undefined) => {
    if (next?.from && next.to) {
      setRange(CUSTOM_VALUE, next.from.toISOString(), next.to.toISOString());
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select onValueChange={onSelectPreset} value={range}>
        <SelectTrigger className="w-44" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIME_PRESETS.map((preset) => (
            <SelectItem key={preset} value={preset}>
              {TIME_PRESET_LABELS[preset]}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_VALUE}>Custom range</SelectItem>
        </SelectContent>
      </Select>

      {range === CUSTOM_VALUE ? (
        <Popover onOpenChange={setOpen} open={open}>
          <PopoverTrigger
            render={
              <Button size="sm" variant="outline">
                <CalendarDays className="size-4" />
                {selectedRange?.from && selectedRange.to
                  ? `${format(selectedRange.from, "MMM d")} – ${format(selectedRange.to, "MMM d")}`
                  : "Pick dates"}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              autoFocus
              defaultMonth={selectedRange?.from}
              mode="range"
              numberOfMonths={2}
              onSelect={onSelectDates}
              selected={selectedRange}
            />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
};
