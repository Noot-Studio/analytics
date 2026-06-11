import "react-grid-layout/css/styles.css";
import {
  ActionBar,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "@sbox-analytics/ui/components/action-bar";
import { Button } from "@sbox-analytics/ui/components/button";
import { Check, Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import type { Layout } from "react-grid-layout";
import { GridLayout, useContainerWidth } from "react-grid-layout";

import { TimeRangeFilter } from "@/features/analytics/components/molecules/time-range-filter";
import { useAnalyticsFilters } from "@/features/analytics/lib/use-analytics-filters";

import type { DashboardScopeValue } from "../../lib/use-dashboard-editor";
import { useDashboardEditor } from "../../lib/use-dashboard-editor";
import { getWidgetDefinition } from "../../lib/widget-registry";
import { AddWidgetDrawer } from "../molecules/add-widget-drawer";
import { DashboardWidgetFrame } from "../molecules/dashboard-widget-frame";

interface DashboardGridProps {
  organizationId?: string;
  projectId?: string;
  scope: DashboardScopeValue;
}

const GRID_COLS = 12;
const ROW_HEIGHT = 35;
const GRID_MARGIN: [number, number] = [16, 16];

export const DashboardGrid = ({
  organizationId,
  projectId,
  scope,
}: DashboardGridProps) => {
  const { from, to } = useAnalyticsFilters();
  const editor = useDashboardEditor({ organizationId, projectId, scope });
  const [addOpen, setAddOpen] = useState(false);
  const { containerRef, width } = useContainerWidth();

  const layout = editor.layout.map((item) => ({
    ...item,
    minH: editor.minH,
    minW: editor.minW,
  }));

  const onLayoutCommit = (next: Layout) => {
    editor.commitLayout(
      next.map((item) => ({
        h: item.h,
        i: item.i,
        w: item.w,
        x: item.x,
        y: item.y,
      }))
    );
  };

  // Convert a measured content height (px) to the smallest row span that fits.
  const rowsForHeight = (contentHeightPx: number) =>
    Math.max(
      editor.minH,
      Math.round(
        (contentHeightPx + GRID_MARGIN[1]) / (ROW_HEIGHT + GRID_MARGIN[1])
      )
    );

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl">Overview</h1>
        <div className="flex items-center gap-2">
          <TimeRangeFilter />
          <Button onClick={() => setAddOpen(true)} variant="outline">
            <Plus />
            Add widget
          </Button>
        </div>
      </div>

      {editor.widgets.length === 0 ? (
        <p className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground text-sm">
          This dashboard is empty. Add a widget to get started.
        </p>
      ) : null}

      <div ref={containerRef}>
        {width > 0 ? (
          <GridLayout
            dragConfig={{ handle: ".widget-drag-handle" }}
            gridConfig={{
              cols: GRID_COLS,
              margin: GRID_MARGIN,
              rowHeight: ROW_HEIGHT,
            }}
            layout={layout}
            onDragStop={onLayoutCommit}
            onResizeStop={onLayoutCommit}
            resizeConfig={{ handles: ["se"] }}
            width={width}
          >
            {editor.widgets.map((widget) => {
              const definition = getWidgetDefinition(widget.widgetType);
              return (
                <div className="overflow-hidden rounded-lg" key={widget.id}>
                  <DashboardWidgetFrame
                    onFit={(px) =>
                      editor.fitHeight(widget.id, rowsForHeight(px))
                    }
                    onRemove={() => editor.removeWidget(widget.id)}
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
                </div>
              );
            })}
          </GridLayout>
        ) : null}
      </div>

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

      <ActionBar open={editor.isDirty}>
        <ActionBarSelection>Unsaved changes</ActionBarSelection>
        <ActionBarSeparator />
        <ActionBarGroup>
          <ActionBarItem
            disabled={editor.isSaving}
            onSelect={editor.cancel}
            variant="outline"
          >
            <X />
            Cancel
          </ActionBarItem>
          <ActionBarItem
            disabled={editor.isSaving}
            onSelect={() => editor.save()}
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
