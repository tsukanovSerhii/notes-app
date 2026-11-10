import type { Note, NotePatch } from "@/app/types/note";
import {
  initialNotesState,
  notesReducer,
  type NotesAction,
  type NotesState,
} from "@/app/lib/notes/reducer";
import { STORAGE_KEY, deserialize, serialize } from "@/app/lib/notes/storage";

export type SaveStatus = "saved" | "pending" | "error";

export interface NotesSnapshot extends NotesState {
  hydrated: boolean;
  saveStatus: SaveStatus;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface NotesStoreOptions {
  /** Resolved lazily so the store can be created during SSR. */
  getStorage: () => KeyValueStorage | null;
  /** Debounce for writes, so typing does not serialize on every keystroke. */
  persistDelayMs?: number;
  now?: () => number;
  createId?: () => string;
  /** Notes to create on the very first visit (nothing stored yet). */
  seed?: (now: number) => Note[];
  /** Injectable so tests can drive the debounce without real waiting. */
  timers?: Timers;
}

export interface NotesStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): NotesSnapshot;
  getServerSnapshot(): NotesSnapshot;
  create(): Note;
  update(id: string, patch: NotePatch): void;
  remove(id: string): void;
  undoDelete(): void;
  togglePin(id: string): void;
  select(id: string | null): void;
  /** Applies a change written by another tab. */
  receiveExternal(raw: string | null): void;
  /** Writes any pending change right away. */
  flush(): void;
}

const SERVER_SNAPSHOT: NotesSnapshot = {
  ...initialNotesState,
  hydrated: false,
  saveStatus: "saved",
};

export function defaultCreateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createNotesStore({
  getStorage,
  persistDelayMs = 300,
  now = Date.now,
  createId = defaultCreateId,
  seed,
  timers = realTimers,
}: NotesStoreOptions): NotesStore {
  let snapshot: NotesSnapshot = SERVER_SNAPSHOT;
  let loaded = false;
  let timer: unknown = null;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());

  const setSnapshot = (next: Partial<NotesSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    emit();
  };

  const write = () => {
    timer = null;
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(
        STORAGE_KEY,
        serialize({ notes: snapshot.notes, activeId: snapshot.activeId })
      );
      if (snapshot.saveStatus !== "saved") setSnapshot({ saveStatus: "saved" });
    } catch {
      // Quota exceeded or storage disabled: keep the data in memory and say so.
      setSnapshot({ saveStatus: "error" });
    }
  };

  const schedulePersist = () => {
    if (timer) timers.clearTimeout(timer);
    timer = timers.setTimeout(write, persistDelayMs);
    if (snapshot.saveStatus !== "pending") setSnapshot({ saveStatus: "pending" });
  };

  const load = () => {
    if (loaded) return;
    const storage = getStorage();
    if (!storage) return;
    loaded = true;

    let raw: string | null = null;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    const persisted = deserialize(raw);
    const isFirstVisit = persisted === null;
    const notes = isFirstVisit ? (seed?.(now()) ?? []) : persisted.notes;
    const state = notesReducer(initialNotesState, {
      type: "replace",
      notes,
      activeId: persisted?.activeId ?? null,
    });

    snapshot = { ...state, hydrated: true, saveStatus: "saved" };
    if (isFirstVisit && notes.length > 0) write();
  };

  const dispatch = (action: NotesAction, persist = true) => {
    load();
    const { notes, activeId, lastDeleted } = snapshot;
    const next = notesReducer({ notes, activeId, lastDeleted }, action);
    if (
      next.notes === notes &&
      next.activeId === activeId &&
      next.lastDeleted === lastDeleted
    ) {
      return;
    }
    snapshot = { ...snapshot, ...next };
    if (persist && (next.notes !== notes || next.activeId !== activeId)) {
      schedulePersist();
    }
    emit();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot() {
      load();
      return snapshot;
    },

    getServerSnapshot: () => SERVER_SNAPSHOT,

    create() {
      const ts = now();
      const note: Note = {
        id: createId(),
        title: "Untitled",
        content: "",
        pinned: false,
        createdAt: ts,
        updatedAt: ts,
      };
      dispatch({ type: "create", note });
      return note;
    },

    update: (id, patch) => dispatch({ type: "update", id, patch, now: now() }),
    remove: (id) => dispatch({ type: "delete", id }),
    undoDelete: () => dispatch({ type: "undoDelete" }),
    togglePin: (id) => dispatch({ type: "togglePin", id }),
    select: (id) => dispatch({ type: "select", id }),

    receiveExternal(raw) {
      const persisted = deserialize(raw);
      if (!persisted) return;
      if (timer) {
        timers.clearTimeout(timer);
        timer = null;
      }
      dispatch(
        { type: "replace", notes: persisted.notes, activeId: snapshot.activeId },
        false
      );
      if (snapshot.saveStatus !== "saved") setSnapshot({ saveStatus: "saved" });
    },

    flush() {
      if (!timer) return;
      timers.clearTimeout(timer);
      write();
    },
  };
}
