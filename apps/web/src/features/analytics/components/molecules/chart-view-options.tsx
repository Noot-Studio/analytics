"use client";

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
import { cn } from "@sbox-analytics/ui/lib/utils";
import { Check, Settings2 } from "lucide-react";
import { useCallback, useState } from "react";

export interface ChartSeries {
  key: string;
  label: string;
}

/**
 * Tracks which chart series are hidden. Mirrors the data-table column
 * visibility model: everything is shown by default, toggling flips a key.
 */
export const useChartVisibility = () => {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const isVisible = useCallback((key: string) => !hidden.has(key), [hidden]);

  return { hidden, isVisible, toggle };
};

interface ChartViewOptionsProps {
  series: ChartSeries[];
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
}

export const ChartViewOptions = ({
  series,
  hidden,
  onToggle,
}: ChartViewOptionsProps) => (
  <Popover>
    <PopoverTrigger
      render={
        <Button
          aria-label="Toggle series"
          className="h-8 font-normal"
          role="combobox"
          size="sm"
          variant="outline"
        />
      }
    >
      <Settings2 className="text-muted-foreground" />
      View
    </PopoverTrigger>
    <PopoverContent align="end" className="w-44 p-0">
      <Command>
        <CommandInput placeholder="Search series..." />
        <CommandList>
          <CommandEmpty>No series found.</CommandEmpty>
          <CommandGroup>
            {series.map((item) => (
              <CommandItem key={item.key} onSelect={() => onToggle(item.key)}>
                <span className="truncate">{item.label}</span>
                <Check
                  className={cn(
                    "ml-auto size-4 shrink-0",
                    hidden.has(item.key) ? "opacity-0" : "opacity-100"
                  )}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
);
