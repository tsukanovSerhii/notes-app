"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createSyncClient } from "@/features/sync/client/syncClient";
import { createAttachmentSync } from "@/features/sync/client/attachmentSync";
import { referencedIds } from "@/features/attachments/attachments";
import { attachmentStore } from "@/features/attachments/localAttachments";
import { noteHistory } from "@/features/history/noteHistory";
import { appClock, deviceId, notesStore } from "@/features/notes/state/useNotes";

const POLL_MS = 30_000;

const attachmentSync = createAttachmentSync({
  store: attachmentStore,
  referenced: () => referencedIds(notesStore.getData().notes.map((n) => n.content)),
  keepOnServer: async () =>
    referencedIds([...notesStore.getData().notes.map((n) => n.content), ...(await noteHistory.contents())]),
  fetch: (...args) => fetch(...args),
  now: appClock.now,
  storage: typeof window === "undefined" ? null : window.localStorage,
});

export const syncClient = createSyncClient({
  store: notesStore,
  fetch: (...args) => fetch(...args),
  keyStorage: typeof window === "undefined" ? null : window.localStorage,
  onServerTime: appClock.observe,
  now: appClock.now,
  deviceId,
  attachments: attachmentSync,
});

export function useSync() {
  const snapshot = useSyncExternalStore(
    syncClient.subscribe,
    syncClient.getSnapshot,
    syncClient.getServerSnapshot
  );
  const enabled = snapshot.key !== null;

  // Pull on start, when the tab regains focus or the network, and on a slow
  // interval so edits from other devices show up without a reload.
  useEffect(() => {
    if (!enabled) return;
    const sync = () => {
      if (document.visibilityState === "visible") void syncClient.syncNow();
    };
    sync();
    const interval = setInterval(sync, POLL_MS);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
    };
  }, [enabled]);

  return { ...snapshot, client: syncClient };
}
