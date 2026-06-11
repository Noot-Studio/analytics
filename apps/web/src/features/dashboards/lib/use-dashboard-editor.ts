import type {
  DashboardWidgetInput,
  WidgetLayout,
} from "@sbox-analytics/api/dashboard-widgets";
import {
  GRID_COLUMNS,
  WIDGET_MIN_H,
  WIDGET_MIN_W,
} from "@sbox-analytics/api/dashboard-widgets";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { orpc } from "@/utils/orpc";

export type DashboardScopeValue = "OrgOverview" | "ProjectOverview";

// Distribute over the union so each branch keeps its discriminated config.
type WithId<T> = T extends unknown ? Omit<T, "id"> & { id: string } : never;
export type DashboardWidgetItem = WithId<DashboardWidgetInput>;

export interface GridLayoutItem extends WidgetLayout {
  i: string;
}

interface UseDashboardEditorParams {
  organizationId?: string;
  projectId?: string;
  scope: DashboardScopeValue;
}

// Width (in grid columns) for legacy widgets saved before free layout existed.
const WIDTH_FOR_SIZE: Record<DashboardWidgetItem["size"], number> = {
  Full: GRID_COLUMNS,
  Half: GRID_COLUMNS / 2,
  Third: GRID_COLUMNS / 3,
  TwoThirds: (GRID_COLUMNS / 3) * 2,
};

// Charts and tables need vertical room; single stats read fine short.
const heightForType = (widgetType: string): number =>
  widgetType.startsWith("chart.") || widgetType.startsWith("list.") ? 10 : 4;

/**
 * Build the react-grid-layout layout from the widgets, honoring saved
 * coordinates and shelf-packing any legacy widget that predates free layout.
 */
const deriveLayout = (widgets: DashboardWidgetItem[]): GridLayoutItem[] => {
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  return widgets.map((widget) => {
    if (widget.layout) {
      return { i: widget.id, ...widget.layout };
    }
    const w = WIDTH_FOR_SIZE[widget.size];
    const h = heightForType(widget.widgetType);
    if (cursorX + w > GRID_COLUMNS) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
    const item = { h, i: widget.id, w, x: cursorX, y: cursorY };
    cursorX += w;
    rowHeight = Math.max(rowHeight, h);
    return item;
  });
};

export const useDashboardEditor = ({
  organizationId,
  projectId,
  scope,
}: UseDashboardEditorParams) => {
  const queryClient = useQueryClient();
  const queryOptions = orpc.dashboards.get.queryOptions({
    input: { organizationId, projectId, scope },
  });
  const { data } = useSuspenseQuery(queryOptions);

  const [draft, setDraft] = useState<DashboardWidgetItem[] | null>(null);

  const saveMutation = useMutation(
    orpc.dashboards.save.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });
      },
    })
  );

  // Fork default (unpersisted) layouts into unique ids so they can become
  // primary keys on first save. Stable as long as `data` stays referential.
  const baseWidgets = useMemo(
    () =>
      (data.widgets as DashboardWidgetItem[]).map((widget) =>
        data.id === null
          ? { ...widget, id: crypto.randomUUID() }
          : { ...widget }
      ),
    [data]
  );

  const isDirty = draft !== null;
  const widgets = draft ?? baseWidgets;
  const layout = useMemo(() => deriveLayout(widgets), [widgets]);

  // Merge react-grid-layout coordinates back onto the widgets after a drag or
  // resize and fork the working draft.
  const commitLayout = useCallback(
    (next: GridLayoutItem[]) => {
      const byId = new Map(next.map((item) => [item.i, item]));
      setDraft(
        widgets.map((widget) => {
          const item = byId.get(widget.id);
          return item
            ? {
                ...widget,
                layout: { h: item.h, w: item.w, x: item.x, y: item.y },
              }
            : widget;
        })
      );
    },
    [widgets]
  );

  // Snap one widget's height to a row count (used by fit-to-content), keeping
  // its current position and width.
  const fitHeight = useCallback(
    (id: string, h: number) => {
      const current = layout.find((item) => item.i === id);
      if (!current) {
        return;
      }
      setDraft(
        widgets.map((widget) =>
          widget.id === id
            ? {
                ...widget,
                layout: { h, w: current.w, x: current.x, y: current.y },
              }
            : widget
        )
      );
    },
    [layout, widgets]
  );

  const removeWidget = useCallback(
    (id: string) => {
      setDraft(widgets.filter((widget) => widget.id !== id));
    },
    [widgets]
  );

  const addWidget = useCallback(
    (widget: DashboardWidgetInput) => {
      // Drop the new widget on a fresh row below everything else.
      let nextY = 0;
      for (const item of layout) {
        nextY = Math.max(nextY, item.y + item.h);
      }
      const w = WIDTH_FOR_SIZE[widget.size];
      const h = heightForType(widget.widgetType);
      setDraft([
        ...widgets,
        {
          ...widget,
          id: crypto.randomUUID(),
          layout: { h, w, x: 0, y: nextY },
        } as DashboardWidgetItem,
      ]);
    },
    [layout, widgets]
  );

  const cancel = useCallback(() => {
    setDraft(null);
  }, []);

  const save = useCallback(async () => {
    if (!draft) {
      return;
    }
    await saveMutation.mutateAsync({
      organizationId,
      projectId,
      scope,
      widgets: draft,
    });
    setDraft(null);
  }, [draft, organizationId, projectId, saveMutation, scope]);

  return {
    addWidget,
    cancel,
    commitLayout,
    fitHeight,
    isDirty,
    isSaving: saveMutation.isPending,
    layout,
    minH: WIDGET_MIN_H,
    minW: WIDGET_MIN_W,
    removeWidget,
    save,
    widgets,
  };
};
