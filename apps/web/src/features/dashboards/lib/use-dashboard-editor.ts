import type { DashboardWidgetInput } from "@sbox-analytics/api/dashboard-widgets";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { orpc } from "@/utils/orpc";

export type DashboardScopeValue = "OrgOverview" | "ProjectOverview";

// Distribute over the union so each branch keeps its discriminated config.
type WithId<T> = T extends unknown ? Omit<T, "id"> & { id: string } : never;
export type DashboardWidgetItem = WithId<DashboardWidgetInput>;

const AUTOSAVE_DELAY_MS = 800;

export type SaveState = "idle" | "saved" | "saving";

interface UseDashboardEditorParams {
  organizationId?: string;
  projectId?: string;
  scope: DashboardScopeValue;
}

/**
 * Working state for one dashboard. Outside edit mode the persisted (or
 * default) layout renders as-is; entering edit mode forks it into a local
 * draft that autosaves (debounced, last write wins) on every change.
 */
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
  const [isEditing, setIsEditing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<DashboardWidgetItem[] | null>(null);

  const saveMutation = useMutation(
    orpc.dashboards.save.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });
      },
    })
  );
  // Keep the latest mutate stable for the unmount flush below.
  const mutateRef = useRef(saveMutation.mutate);
  mutateRef.current = saveMutation.mutate;

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const widgets = pendingRef.current;
    if (widgets) {
      pendingRef.current = null;
      mutateRef.current({ organizationId, projectId, scope, widgets });
    }
  }, [organizationId, projectId, scope]);

  const applyChange = useCallback(
    (widgets: DashboardWidgetItem[]) => {
      setDraft(widgets);
      pendingRef.current = widgets;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
    },
    [flush]
  );

  // Don't lose an in-flight debounce if the page unmounts mid-edit.
  useEffect(() => flush, [flush]);

  const startEditing = useCallback(() => {
    // Default (unpersisted) layouts carry shared placeholder ids; fork them
    // into unique ids so they can become primary keys on first save.
    const widgets = (data.widgets as DashboardWidgetItem[]).map((widget) =>
      data.id === null ? { ...widget, id: crypto.randomUUID() } : { ...widget }
    );
    setDraft(widgets);
    setIsEditing(true);
  }, [data]);

  const stopEditing = useCallback(() => {
    flush();
    setIsEditing(false);
    setDraft(null);
  }, [flush]);

  const widgets =
    isEditing && draft ? draft : (data.widgets as DashboardWidgetItem[]);

  const reorder = useCallback(
    (next: DashboardWidgetItem[]) => applyChange(next),
    [applyChange]
  );

  const removeWidget = useCallback(
    (id: string) => {
      if (!draft) {
        return;
      }
      applyChange(draft.filter((widget) => widget.id !== id));
    },
    [applyChange, draft]
  );

  const setSize = useCallback(
    (id: string, size: DashboardWidgetItem["size"]) => {
      if (!draft) {
        return;
      }
      applyChange(
        draft.map((widget) => (widget.id === id ? { ...widget, size } : widget))
      );
    },
    [applyChange, draft]
  );

  const addWidget = useCallback(
    (widget: DashboardWidgetInput) => {
      if (!draft) {
        return;
      }
      applyChange([
        ...draft,
        { ...widget, id: crypto.randomUUID() } as DashboardWidgetItem,
      ]);
    },
    [applyChange, draft]
  );

  let saveState: SaveState = "idle";
  if (saveMutation.isPending) {
    saveState = "saving";
  } else if (saveMutation.isSuccess) {
    saveState = "saved";
  }

  return {
    addWidget,
    isEditing,
    removeWidget,
    reorder,
    saveState,
    setSize,
    startEditing,
    stopEditing,
    widgets,
  };
};
