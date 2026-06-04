import type { DashboardCardInput } from "@sbox-analytics/api/dashboard-cards";
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
export type DashboardCardItem = WithId<DashboardCardInput>;

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

  const [draft, setDraft] = useState<DashboardCardItem[] | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<DashboardCardItem[] | null>(null);

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
    const cards = pendingRef.current;
    if (cards) {
      pendingRef.current = null;
      mutateRef.current({ cards, organizationId, projectId, scope });
    }
  }, [organizationId, projectId, scope]);

  const applyChange = useCallback(
    (cards: DashboardCardItem[]) => {
      setDraft(cards);
      pendingRef.current = cards;
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
    const cards = (data.cards as DashboardCardItem[]).map((card) =>
      data.id === null ? { ...card, id: crypto.randomUUID() } : { ...card }
    );
    setDraft(cards);
    setIsEditing(true);
  }, [data]);

  const stopEditing = useCallback(() => {
    flush();
    setIsEditing(false);
    setDraft(null);
  }, [flush]);

  const cards =
    isEditing && draft ? draft : (data.cards as DashboardCardItem[]);

  const reorder = useCallback(
    (next: DashboardCardItem[]) => applyChange(next),
    [applyChange]
  );

  const removeCard = useCallback(
    (id: string) => {
      if (!draft) {
        return;
      }
      applyChange(draft.filter((card) => card.id !== id));
    },
    [applyChange, draft]
  );

  const setSize = useCallback(
    (id: string, size: DashboardCardItem["size"]) => {
      if (!draft) {
        return;
      }
      applyChange(
        draft.map((card) => (card.id === id ? { ...card, size } : card))
      );
    },
    [applyChange, draft]
  );

  const addCard = useCallback(
    (card: DashboardCardInput) => {
      if (!draft) {
        return;
      }
      applyChange([
        ...draft,
        { ...card, id: crypto.randomUUID() } as DashboardCardItem,
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
    addCard,
    cards,
    isEditing,
    removeCard,
    reorder,
    saveState,
    setSize,
    startEditing,
    stopEditing,
  };
};
