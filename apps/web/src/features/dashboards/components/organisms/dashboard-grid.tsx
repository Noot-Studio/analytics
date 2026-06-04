import { Button } from "@sbox-analytics/ui/components/button";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import {
  Sortable,
  SortableContent,
  SortableOverlay,
} from "@sbox-analytics/ui/components/sortable";
import { Check, Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { TimeRangeFilter } from "@/features/analytics/components/molecules/time-range-filter";
import { useAnalyticsFilters } from "@/features/analytics/lib/use-analytics-filters";

import { getCardDefinition } from "../../lib/card-registry";
import type {
  DashboardCardItem,
  DashboardScopeValue,
} from "../../lib/use-dashboard-editor";
import { useDashboardEditor } from "../../lib/use-dashboard-editor";
import { AddCardDrawer } from "../molecules/add-card-drawer";
import { CardSizeMenu } from "../molecules/card-size-menu";
import { DashboardCardFrame } from "../molecules/dashboard-card-frame";

interface DashboardGridProps {
  organizationId?: string;
  projectId?: string;
  scope: DashboardScopeValue;
}

const SaveIndicator = ({ state }: { state: "idle" | "saved" | "saving" }) => {
  if (state === "idle") {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
      {state === "saving" ? (
        <>
          <Loader2 aria-hidden className="size-3 animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <Check aria-hidden className="size-3" />
          Saved
        </>
      )}
    </span>
  );
};

export const DashboardGrid = ({
  organizationId,
  projectId,
  scope,
}: DashboardGridProps) => {
  const { from, to } = useAnalyticsFilters();
  const editor = useDashboardEditor({ organizationId, projectId, scope });
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl">Overview</h1>
        <div className="flex items-center gap-2">
          <SaveIndicator state={editor.isEditing ? editor.saveState : "idle"} />
          <TimeRangeFilter />
          {editor.isEditing ? (
            <>
              <Button onClick={() => setAddOpen(true)} variant="outline">
                <Plus />
                Add card
              </Button>
              <Button onClick={editor.stopEditing}>
                <Check />
                Done
              </Button>
            </>
          ) : (
            <Button onClick={editor.startEditing} variant="outline">
              <Pencil />
              Customize
            </Button>
          )}
        </div>
      </div>

      {editor.cards.length === 0 ? (
        <p className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground text-sm">
          This dashboard is empty. Add a card to get started.
        </p>
      ) : null}

      <Sortable
        getItemValue={(card: DashboardCardItem) => card.id}
        onValueChange={editor.reorder}
        orientation="mixed"
        value={editor.cards}
      >
        <SortableContent className="grid grid-cols-1 gap-4 md:grid-cols-6">
          {editor.cards.map((card) => {
            const definition = getCardDefinition(card.cardType);
            return (
              <DashboardCardFrame
                id={card.id}
                isEditing={editor.isEditing}
                key={card.id}
                onRemove={() => editor.removeCard(card.id)}
                size={card.size}
                sizeMenu={
                  <CardSizeMenu
                    onSizeChange={(size) => editor.setSize(card.id, size)}
                    size={card.size}
                  />
                }
              >
                {definition ? (
                  <definition.Renderer
                    config={card.config}
                    from={from}
                    organizationId={organizationId}
                    projectId={projectId}
                    to={to}
                  />
                ) : (
                  <div className="flex h-full min-h-24 items-center justify-center rounded-lg border border-border p-4 text-muted-foreground text-sm">
                    Unknown card type.
                  </div>
                )}
              </DashboardCardFrame>
            );
          })}
        </SortableContent>
        <SortableOverlay>
          <Skeleton className="h-full w-full rounded-lg" />
        </SortableOverlay>
      </Sortable>

      <AddCardDrawer
        from={from}
        onAdd={editor.addCard}
        onOpenChange={setAddOpen}
        open={addOpen}
        organizationId={organizationId}
        projectId={projectId}
        scope={scope}
        to={to}
      />
    </div>
  );
};
