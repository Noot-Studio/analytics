import type { CardSizeValue } from "@sbox-analytics/api/dashboard-cards";
import { Button } from "@sbox-analytics/ui/components/button";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import {
  SortableItem,
  SortableItemHandle,
} from "@sbox-analytics/ui/components/sortable";
import { cn } from "@sbox-analytics/ui/lib/utils";
import { GripVertical, X } from "lucide-react";
import { Suspense } from "react";
import type { ReactNode } from "react";

import { CardErrorBoundary } from "../atoms/card-error-boundary";

// 6-col grid: the LCM of halves and thirds, so every preset is an integer span.
const SIZE_CLASS: Record<CardSizeValue, string> = {
  Full: "md:col-span-6",
  Half: "md:col-span-3",
  Third: "md:col-span-2",
  TwoThirds: "md:col-span-4",
};

interface DashboardCardFrameProps {
  children: ReactNode;
  id: string;
  isEditing: boolean;
  onRemove: () => void;
  onSizeChange: (size: CardSizeValue) => void;
  size: CardSizeValue;
  sizeMenu: ReactNode;
}

export const DashboardCardFrame = ({
  children,
  id,
  isEditing,
  onRemove,
  size,
  sizeMenu,
}: Omit<DashboardCardFrameProps, "onSizeChange">) => (
  <SortableItem className={cn("flex flex-col", SIZE_CLASS[size])} value={id}>
    {isEditing ? (
      <div className="mb-1 flex items-center justify-end gap-1">
        {sizeMenu}
        <Button
          aria-label="Remove card"
          onClick={onRemove}
          size="icon"
          variant="ghost"
        >
          <X />
        </Button>
        <SortableItemHandle aria-label="Drag to reorder" asChild>
          <Button size="icon" variant="ghost">
            <GripVertical />
          </Button>
        </SortableItemHandle>
      </div>
    ) : null}
    <div className="flex-1">
      <CardErrorBoundary>
        <Suspense fallback={<Skeleton className="h-full min-h-24 w-full" />}>
          {children}
        </Suspense>
      </CardErrorBoundary>
    </div>
  </SortableItem>
);
