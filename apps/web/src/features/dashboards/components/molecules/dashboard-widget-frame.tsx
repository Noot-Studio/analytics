import { Button } from "@sbox-analytics/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sbox-analytics/ui/components/dropdown-menu";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import { GripVertical, MoreVertical, Maximize2, Trash2 } from "lucide-react";
import { Suspense, useCallback, useRef } from "react";
import type { ReactNode } from "react";

import { WidgetErrorBoundary } from "../atoms/widget-error-boundary";

interface DashboardWidgetFrameProps {
  children: ReactNode;
  onFit: (contentHeightPx: number) => void;
  onRemove: () => void;
}

export const DashboardWidgetFrame = ({
  children,
  onFit,
  onRemove,
}: DashboardWidgetFrameProps) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // Measure the content's natural height by briefly releasing the fixed grid
  // height, then hand the pixels up so the grid can snap to matching rows.
  const handleFit = useCallback(() => {
    const el = contentRef.current;
    if (!el) {
      return;
    }
    // The wrapper is a flex child (flex-1), so an inline height is ignored for
    // sizing. Drop it out of the flex flow to let it hug its content, measure,
    // then restore.
    el.style.flex = "none";
    el.style.height = "auto";
    const naturalHeight = el.scrollHeight;
    el.style.flex = "";
    el.style.height = "";
    onFit(naturalHeight);
  }, [onFit]);

  return (
    <div className="group flex h-full flex-col">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md bg-card opacity-0 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button aria-label="Widget options" size="icon" variant="ghost" />
            }
          >
            <MoreVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleFit}>
              <Maximize2 />
              Fit to content
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRemove} variant="destructive">
              <Trash2 />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          aria-label="Drag to move"
          className="widget-drag-handle cursor-grab active:cursor-grabbing"
          size="icon"
          variant="ghost"
        >
          <GripVertical />
        </Button>
      </div>

      <div className="min-h-0 flex-1" ref={contentRef}>
        <WidgetErrorBoundary>
          <Suspense fallback={<Skeleton className="h-full min-h-24 w-full" />}>
            {children}
          </Suspense>
        </WidgetErrorBoundary>
      </div>
    </div>
  );
};
