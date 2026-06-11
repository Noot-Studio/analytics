import {
  ActionBar,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "@sbox-analytics/ui/components/action-bar";
import { Button } from "@sbox-analytics/ui/components/button";
import { Skeleton } from "@sbox-analytics/ui/components/skeleton";
import {
  Sortable,
  SortableContent,
  SortableOverlay,
} from "@sbox-analytics/ui/components/sortable";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";

import { TimeRangeFilter } from "@/features/analytics/components/molecules/time-range-filter";
import { useAnalyticsFilters } from "@/features/analytics/lib/use-analytics-filters";

import type {
  DashboardWidgetItem,
  DashboardScopeValue,
} from "../../lib/use-dashboard-editor";
import { useDashboardEditor } from "../../lib/use-dashboard-editor";
import { getWidgetDefinition } from "../../lib/widget-registry";
import { AddWidgetDrawer } from "../molecules/add-widget-drawer";
import { DashboardWidgetFrame } from "../molecules/dashboard-widget-frame";
import { WidgetSizeMenu } from "../molecules/widget-size-menu";

interface DashboardGridProps {
  organizationId?: string;
  projectId?: string;
  scope: DashboardScopeValue;
}

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
          <TimeRangeFilter />
          {editor.isEditing ? (
            <>
              <Button onClick={() => setAddOpen(true)} variant="outline">
                <Plus />
                Add widget
              </Button>
              {editor.isDirty ? null : (
                <Button onClick={editor.cancelEditing} variant="outline">
                  <Check />
                  Done
                </Button>
              )}
            </>
          ) : (
            <Button onClick={editor.startEditing} variant="outline">
              <Pencil />
              Customize
            </Button>
          )}
        </div>
      </div>

      {editor.widgets.length === 0 ? (
        <p className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground text-sm">
          This dashboard is empty. Add a widget to get started.
        </p>
      ) : null}

      <Sortable
        getItemValue={(widget: DashboardWidgetItem) => widget.id}
        onValueChange={editor.reorder}
        orientation="mixed"
        value={editor.widgets}
      >
        <SortableContent className="grid grid-cols-1 gap-4 md:grid-cols-6">
          {editor.widgets.map((widget) => {
            const definition = getWidgetDefinition(widget.widgetType);
            return (
              <DashboardWidgetFrame
                id={widget.id}
                isEditing={editor.isEditing}
                key={widget.id}
                onRemove={() => editor.removeWidget(widget.id)}
                size={widget.size}
                sizeMenu={
                  <WidgetSizeMenu
                    onSizeChange={(size) => editor.setSize(widget.id, size)}
                    size={widget.size}
                  />
                }
              >
                {definition ? (
                  <definition.Renderer
                    config={widget.config}
                    from={from}
                    organizationId={organizationId}
                    projectId={projectId}
                    to={to}
                  />
                ) : (
                  <div className="flex h-full min-h-24 items-center justify-center rounded-lg border border-border p-4 text-muted-foreground text-sm">
                    Unknown widget type.
                  </div>
                )}
              </DashboardWidgetFrame>
            );
          })}
        </SortableContent>
        <SortableOverlay>
          <Skeleton className="h-full w-full rounded-lg" />
        </SortableOverlay>
      </Sortable>

      <AddWidgetDrawer
        from={from}
        onAdd={editor.addWidget}
        onOpenChange={setAddOpen}
        open={addOpen}
        organizationId={organizationId}
        projectId={projectId}
        scope={scope}
        to={to}
      />

      <ActionBar open={editor.isEditing && editor.isDirty}>
        <ActionBarSelection>Unsaved changes</ActionBarSelection>
        <ActionBarSeparator />
        <ActionBarGroup>
          <ActionBarItem
            disabled={editor.isSaving}
            onSelect={editor.cancelEditing}
            variant="outline"
          >
            <X />
            Cancel
          </ActionBarItem>
          <ActionBarItem
            disabled={editor.isSaving}
            onSelect={() => editor.saveEditing()}
            variant="default"
          >
            {editor.isSaving ? <Loader2 className="animate-spin" /> : <Check />}
            Save
          </ActionBarItem>
        </ActionBarGroup>
      </ActionBar>
    </div>
  );
};
