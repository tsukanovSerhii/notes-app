"use client";

import { useEffect } from "react";
import type { SyncClient } from "@/features/sync/client/syncClient";
import { useI18n } from "@/shared/i18n";
import type { ShowToast } from "@/features/workspace/useToast";

/** Tells the user when sync kept their overwritten text as a copy. */
export function useConflictToasts(syncClient: SyncClient, showToast: ShowToast) {
  const { t, count } = useI18n();
  useEffect(() => {
    let seen = syncClient.getSnapshot().lastConflict?.at;
    return syncClient.subscribe(() => {
      const conflict = syncClient.getSnapshot().lastConflict;
      if (!conflict || conflict.at === seen) return;
      seen = conflict.at;
      const [first, ...rest] = conflict.titles;
      showToast({
        text: rest.length
          ? t.toast.conflictMany(count(conflict.titles.length, t.plural.notes))
          : t.toast.conflictOne(first),
      });
    });
  }, [syncClient, showToast, t, count]);
}
