import type { Folder, Note, NotePatch, NotesData } from "@/app/types/note";
import {
  initialNotesState,
  notesReducer,
  toData,
  type NotesAction,
  type NotesState,
} from "@/app/lib/notes/reducer";
import type { NotesPersistence, PersistChange } from "@/app/lib/notes/persistence";

export type SaveStatus = "saved" | "pending" | "error";

export interface NotesSnapshot extends NotesState {
  hydrated: boolean;
  saveStatus: SaveStatus;
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
  getPersistence: () => NotesPersistence | null;
  /** Debounce for writes, so typing does not hit storage on every keystroke. */
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
  /** Fires only when synced data changes locally (not on selection or status). */
  subscribeData(listener: () => void): () => void;
  getSnapshot(): NotesSnapshot;
  getServerSnapshot(): NotesSnapshot;
  /** Loads persisted data. Safe to call repeatedly. */
  start(): Promise<void>;
  getData(): NotesData;
  create(init?: Partial<Pick<Note, "title" | "content" | "folderId" | "tags">>): Note;
  update(id: string, patch: NotePatch): void;
  remove(id: string): void;
  undoDelete(): void;
  togglePin(id: string): void;
  select(id: string | null): void;
  createFolder(name: string): Folder | null;
  renameFolder(id: string, name: string): void;
  deleteFolder(id: string): void;
  /** Merges data from the sync server or an imported backup. */
  merge(data: NotesData, mode: "sync" | "import"): void;
  /** Adds several notes at once (file import). */
  addNotes(notes: Note[]): void;
  /** Writes any pending change right away. */
  flush(): Promise<void>;
  /** Synchronous last-chance write for `pagehide`. */
  flushSync(): void;
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
  getPersistence,
  persistDelayMs = 300,
  now = Date.now,
  createId = defaultCreateId,
  seed,
  timers = realTimers,
}: NotesStoreOptions): NotesStore {
  let snapshot: NotesSnapshot = SERVER_SNAPSHOT;
  let startPromise: Promise<void> | null = null;
  let timer: unknown = null;
  let writing: Promise<void> = Promise.resolve();
  /** Notes changed or deleted since the last write. */
  const dirtyIds = new Set<string>();
  let metaDirty = false;
  const listeners = new Set<() => void>();
  const dataListeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());
  const setSnapshot = (next: Partial<NotesSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    emit();
  };

  const takeChange = (): PersistChange | null => {
    if (dirtyIds.size === 0 && !metaDirty) return null;
    const byId = new Map(snapshot.notes.map((n) => [n.id, n]));
    const change: PersistChange = { putNotes: [], deleteNoteIds: [], meta: {
      folders: snapshot.folders,
      tombstones: snapshot.tombstones,
      activeId: snapshot.activeId,
    } };
    for (const id of dirtyIds) {
      const note = byId.get(id);
      if (note) change.putNotes.push(note);
      else change.deleteNoteIds.push(id);
    }
    dirtyIds.clear();
    metaDirty = false;
    return change;
  };

  const write = (): Promise<void> => {
    timer = null;
    const persistence = getPersistence();
    const change = takeChange();
    if (!persistence || !change) return writing;
    writing = writing
      .then(() => persistence.save(change))
      .then(
        () => {
          if (!timer && snapshot.saveStatus !== "saved") setSnapshot({ saveStatus: "saved" });
        },
        () => setSnapshot({ saveStatus: "error" })
      );
    return writing;
  };

  const schedulePersist = () => {
    if (timer) timers.clearTimeout(timer);
    timer = timers.setTimeout(() => void write(), persistDelayMs);
    if (snapshot.saveStatus !== "pending") setSnapshot({ saveStatus: "pending" });
  };

  /** Records what changed between two states so only that gets written. */
  const markDirty = (prev: NotesState, next: NotesState) => {
    if (prev.notes !== next.notes) {
      const before = new Map(prev.notes.map((n) => [n.id, n]));
      for (const note of next.notes) {
        if (before.get(note.id) !== note) dirtyIds.add(note.id);
        before.delete(note.id);
      }
      for (const id of before.keys()) dirtyIds.add(id);
    }
    if (
      prev.folders !== next.folders ||
      prev.tombstones !== next.tombstones ||
      prev.activeId !== next.activeId
    ) {
      metaDirty = true;
    }
  };

  const dataChanged = (prev: NotesState, next: NotesState) =>
    prev.notes !== next.notes ||
    prev.folders !== next.folders ||
    prev.tombstones !== next.tombstones;

  const dispatch = (action: NotesAction, { persist = true, local = true } = {}) => {
    if (!snapshot.hydrated) return;
    const prev = snapshot;
    const next = notesReducer(prev, action);
    if (
      next.notes === prev.notes &&
      next.folders === prev.folders &&
      next.tombstones === prev.tombstones &&
      next.activeId === prev.activeId &&
      next.lastDeleted === prev.lastDeleted
    ) {
      return;
    }
    snapshot = { ...snapshot, ...next };
    if (persist) {
      markDirty(prev, next);
      if (dirtyIds.size > 0 || metaDirty) schedulePersist();
    }
    emit();
    if (local && dataChanged(prev, next)) dataListeners.forEach((l) => l());
  };

  /** Re-reads storage after another tab wrote, keeping unsaved local edits. */
  const reloadExternal = async () => {
    const persistence = getPersistence();
    if (!persistence || !snapshot.hydrated) return;
    const loaded = await persistence.load();
    if (!loaded) return;
    const local = new Map(snapshot.notes.map((n) => [n.id, n]));
    const notes = loaded.data.notes.filter((n) => !dirtyIds.has(n.id));
    for (const id of dirtyIds) {
      const note = local.get(id);
      if (note) notes.push(note);
    }
    dispatch(
      { type: "replace", data: { ...loaded.data, notes }, activeId: snapshot.activeId },
      { persist: false, local: false }
    );
  };

  const start = () => {
    if (startPromise) return startPromise;
    const persistence = getPersistence();
    if (!persistence) return Promise.resolve();

    startPromise = (async () => {
      let persisted = null;
      let failed = false;
      try {
        persisted = await persistence.load();
      } catch {
        failed = true;
      }
      const isFirstVisit = persisted === null && !failed;
      const data: NotesData = persisted?.data ?? {
        notes: isFirstVisit ? (seed?.(now()) ?? []) : [],
        folders: [],
        tombstones: {},
      };
      const state = notesReducer(initialNotesState, {
        type: "replace",
        data,
        activeId: persisted?.activeId ?? null,
      });
      snapshot = {
        ...state,
        hydrated: true,
        saveStatus: failed ? "error" : "saved",
      };
      if (isFirstVisit) {
        markDirty(initialNotesState, state);
        void write();
      }
      persistence.subscribe?.(() => void reloadExternal());
      emit();
    })();
    return startPromise;
  };

  const ts = () => now();

  return {
    subscribe(listener) {
      listeners.add(listener);
      void start();
      return () => listeners.delete(listener);
    },
    subscribeData(listener) {
      dataListeners.add(listener);
      return () => dataListeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
    start,
    getData: () => toData(snapshot),

    create(init = {}) {
      const t = ts();
      const note: Note = {
        id: createId(),
        title: init.title ?? "Untitled",
        content: init.content ?? "",
        pinned: false,
        tags: init.tags ?? [],
        folderId: init.folderId ?? null,
        createdAt: t,
        updatedAt: t,
        editedAt: t,
      };
      dispatch({ type: "create", note });
      return note;
    },

    update: (id, patch) => dispatch({ type: "update", id, patch, now: ts() }),
    remove: (id) => dispatch({ type: "delete", id, now: ts() }),
    undoDelete: () => dispatch({ type: "undoDelete", now: ts() }),
    togglePin: (id) => dispatch({ type: "togglePin", id, now: ts() }),
    select: (id) => dispatch({ type: "select", id }),

    createFolder(name) {
      const clean = name.trim().slice(0, 60);
      if (!clean) return null;
      const t = ts();
      const folder: Folder = { id: createId(), name: clean, createdAt: t, updatedAt: t };
      dispatch({ type: "createFolder", folder });
      return folder;
    },
    renameFolder: (id, name) => dispatch({ type: "renameFolder", id, name, now: ts() }),
    deleteFolder: (id) => dispatch({ type: "deleteFolder", id, now: ts() }),

    merge(data, mode) {
      dispatch({ type: "merge", data, mode, now: ts() }, { local: mode === "import" });
    },

    addNotes(notes) {
      if (notes.length === 0) return;
      dispatch(
        { type: "merge", data: { notes, folders: [], tombstones: {} }, mode: "import", now: ts() }
      );
      dispatch({ type: "select", id: notes[0].id });
    },

    async flush() {
      if (timer) timers.clearTimeout(timer);
      await write();
    },

    flushSync() {
      const persistence = getPersistence();
      if (timer) {
        timers.clearTimeout(timer);
        timer = null;
      }
      const change = takeChange();
      if (!persistence || !change) return;
      if (persistence.saveSync) persistence.saveSync(change);
      else void persistence.save(change);
    },
  };
}
