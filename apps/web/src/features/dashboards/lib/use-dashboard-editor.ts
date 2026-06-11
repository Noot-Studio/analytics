import type { DashboardWidgetInput } from "@sbox-analytics/api/dashboard-widgets";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { orpc } from "@/utils/orpc";

export type DashboardScopeValue = "OrgOverview" | "ProjectOverview";

// Distribute over the union so each branch keeps its discriminated config.
type WithId<T> = T extends unknown ? Omit<T, "id"> & { id: string } : never;
export type DashboardWidgetItem = WithId<DashboardWidgetInput>;

interface UseDashboardEditorParams {
  organizationId?: string;
  projectId?: string;
  scope: DashboardScopeValue;
}

/**
 * Working state for one dashboard. Outside edit mode the persisted (or
 * default) layout renders as-is; entering edit mode forks it into a local
 * draft that is only persisted when the user explicitly saves. Cancelling
 * discards the draft.
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
  const [isDirty, setIsDirty] = useState(false);

  const saveMutation = useMutation(
    orpc.dashboards.save.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });
      },
    })
  );

  const startEditing = useCallback(() => {
    // Default (unpersisted) layouts carry shared placeholder ids; fork them
    // into unique ids so they can become primary keys on first save.
    const widgets = (data.widgets as DashboardWidgetItem[]).map((widget) =>
      data.id === null ? { ...widget, id: crypto.randomUUID() } : { ...widget }
    );
    setDraft(widgets);
    setIsEditing(true);
    setIsDirty(false);
  }, [data]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setDraft(null);
    setIsDirty(false);
  }, []);

  const saveEditing = useCallback(async () => {
    if (draft) {
      await saveMutation.mutateAsync({
        organizationId,
        projectId,
        scope,
        widgets: draft,
      });
    }
    setIsEditing(false);
    setDraft(null);
    setIsDirty(false);
  }, [draft, organizationId, projectId, saveMutation, scope]);

  const widgets =
    isEditing && draft ? draft : (data.widgets as DashboardWidgetItem[]);

  const applyChange = useCallback((next: DashboardWidgetItem[]) => {
    setDraft(next);
    setIsDirty(true);
  }, []);

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

  return {
    addWidget,
    cancelEditing,
    isDirty,
    isEditing,
    isSaving: saveMutation.isPending,
    removeWidget,
    reorder,
    saveEditing,
    setSize,
    startEditing,
    widgets,
  };
};
