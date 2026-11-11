"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createNotesStore } from "@/app/lib/notes/store";
import { sortNotes } from "@/app/lib/notes/reducer";
import { createIndexedDbPersistence } from "@/app/lib/notes/idb";
import {
  createLocalStoragePersistence,
  type NotesPersistence,
} from "@/app/lib/notes/persistence";
import { createWelcomeNotes } from "@/app/lib/notes/welcome";
import { createSkewClock } from "@/app/lib/clock";

let persistence: NotesPersistence | null = null;

function getPersistence(): NotesPersistence | null {
  if (typeof window === "undefined") return null;
  persistence ??=
    "indexedDB" in window && window.indexedDB
      ? createIndexedDbPersistence(window.indexedDB, window.localStorage)
      : createLocalStoragePersistence(window.localStorage);
  return persistence;
}

function getLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Timestamps for every change, corrected towards the sync server's clock. */
export const appClock = createSkewClock({ storage: getLocalStorage() });

export const notesStore = createNotesStore({
  getPersistence,
  seed: createWelcomeNotes,
  now: appClock.now,
});

export function useNotes() {
  const snapshot = useSyncExternalStore(
    notesStore.subscribe,
    notesStore.getSnapshot,
    notesStore.getServerSnapshot
  );

  useEffect(() => {
    const flush = () => notesStore.flushSync();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void notesStore.flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const notes = useMemo(() => sortNotes(snapshot.notes), [snapshot.notes]);
  const activeNote = useMemo(
    () => snapshot.notes.find((n) => n.id === snapshot.activeId) ?? null,
    [snapshot.notes, snapshot.activeId]
  );
  const folders = useMemo(
    () => [...snapshot.folders].sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot.folders]
  );

  return {
    notes,
    folders,
    activeNote,
    lastDeleted: snapshot.lastDeleted,
    hydrated: snapshot.hydrated,
    saveStatus: snapshot.saveStatus,
    store: notesStore,
  };
}
