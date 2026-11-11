"use client";

import { appClock, notesStore } from "@/features/notes/state/useNotes";
import { openDatabase } from "@/features/notes/persistence/indexedDb";
import {
  createHistoryRecorder,
  createIndexedDbHistory,
  createMemoryHistory,
  type HistoryRecorder,
  type HistoryStore,
} from "@/features/history/history";

/** Earlier versions of notes, kept on this device only. */
export const noteHistory: HistoryStore =
  typeof window !== "undefined" && "indexedDB" in window && window.indexedDB
    ? createIndexedDbHistory(() => openDatabase(window.indexedDB))
    : createMemoryHistory();

/** Watches the notes store and saves versions; null during server rendering. */
export const historyRecorder: HistoryRecorder | null =
  typeof window === "undefined"
    ? null
    : createHistoryRecorder({ store: notesStore, history: noteHistory, now: appClock.now });
