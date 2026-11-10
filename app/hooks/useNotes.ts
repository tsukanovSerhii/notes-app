"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createNotesStore } from "@/app/lib/notes/store";
import { sortNotes } from "@/app/lib/notes/reducer";
import { STORAGE_KEY } from "@/app/lib/notes/storage";
import { createWelcomeNotes } from "@/app/lib/notes/welcome";

const notesStore = createNotesStore({
  getStorage: () => (typeof window === "undefined" ? null : window.localStorage),
  seed: createWelcomeNotes,
});

export function useNotes() {
  const snapshot = useSyncExternalStore(
    notesStore.subscribe,
    notesStore.getSnapshot,
    notesStore.getServerSnapshot
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) notesStore.receiveExternal(e.newValue);
    };
    const flush = () => notesStore.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const notes = useMemo(() => sortNotes(snapshot.notes), [snapshot.notes]);
  const activeNote = useMemo(
    () => snapshot.notes.find((n) => n.id === snapshot.activeId) ?? null,
    [snapshot.notes, snapshot.activeId]
  );

  return {
    notes,
    activeNote,
    lastDeleted: snapshot.lastDeleted,
    hydrated: snapshot.hydrated,
    saveStatus: snapshot.saveStatus,
    createNote: notesStore.create,
    updateNote: notesStore.update,
    deleteNote: notesStore.remove,
    undoDelete: notesStore.undoDelete,
    togglePin: notesStore.togglePin,
    selectNote: notesStore.select,
  };
}
