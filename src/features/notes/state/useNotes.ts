"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createNotesStore, defaultCreateId } from "@/features/notes/state/store";
import { liveNotes, sortNotes, trashedNotes } from "@/features/notes/model/reducer";
import { createIndexedDbPersistence, openDatabase } from "@/features/notes/persistence/indexedDb";
import {
  createHistoryRecorder,
  createIndexedDbHistory,
  createMemoryHistory,
  type HistoryRecorder,
  type HistoryStore,
} from "@/features/history/history";
import {
  createLocalStoragePersistence,
  type NotesPersistence,
} from "@/features/notes/persistence/persistence";
import { createWelcomeNotes } from "@/features/notes/model/welcome";
import { createSkewClock } from "@/shared/lib/clock";
import { currentLocale } from "@/shared/i18n";

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

const DEVICE_ID_KEY = "notevoid-device-id";

/** A random id for this browser profile, kept so sync can tell its edits apart. */
function getDeviceId(): string | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    let id = storage.getItem(DEVICE_ID_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = defaultCreateId().replace(/[^A-Za-z0-9_-]/g, "");
      storage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export const deviceId = getDeviceId();

/** Timestamps for every change, corrected towards the sync server's clock. */
export const appClock = createSkewClock({ storage: getLocalStorage() });

export const notesStore = createNotesStore({
  getPersistence,
  // The first-visit note is written in the language the app starts in.
  seed: (now) => createWelcomeNotes(now, currentLocale()),
  now: appClock.now,
  deviceId,
});

/** Earlier versions of notes, kept on this device only. */
export const noteHistory: HistoryStore =
  typeof window !== "undefined" && "indexedDB" in window && window.indexedDB
    ? createIndexedDbHistory(() => openDatabase(window.indexedDB))
    : createMemoryHistory();

export const historyRecorder: HistoryRecorder | null =
  typeof window === "undefined"
    ? null
    : createHistoryRecorder({ store: notesStore, history: noteHistory, now: appClock.now });

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

  const notes = useMemo(() => sortNotes(liveNotes(snapshot.notes)), [snapshot.notes]);
  const trash = useMemo(() => trashedNotes(snapshot.notes), [snapshot.notes]);
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
    trash,
    folders,
    activeNote,
    lastDeleted: snapshot.lastDeleted,
    hydrated: snapshot.hydrated,
    saveStatus: snapshot.saveStatus,
    store: notesStore,
  };
}
