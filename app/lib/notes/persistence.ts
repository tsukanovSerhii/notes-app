import type { Folder, Note, Tombstones } from "@/app/types/note";
import {
  STORAGE_KEY,
  deserialize,
  serialize,
  type PersistedState,
} from "@/app/lib/notes/storage";

/** An incremental write: only the notes that changed, plus small metadata. */
export interface PersistChange {
  putNotes: Note[];
  deleteNoteIds: string[];
  meta: PersistedMeta;
}

export interface PersistedMeta {
  folders: Folder[];
  tombstones: Tombstones;
  activeId: string | null;
}

export interface NotesPersistence {
  /** Resolves to null on the very first visit (nothing stored yet). */
  load(): Promise<PersistedState | null>;
  save(change: PersistChange): Promise<void>;
  /**
   * Last-chance synchronous write while the page is unloading, when an async
   * IndexedDB transaction might not finish. Optional.
   */
  saveSync?(change: PersistChange): void;
  /** Calls back when another tab wrote new data. */
  subscribe?(onExternalChange: () => void): () => void;
}

export function applyChange(
  state: PersistedState | null,
  change: PersistChange
): PersistedState {
  const notes = new Map((state?.data.notes ?? []).map((n) => [n.id, n]));
  for (const id of change.deleteNoteIds) notes.delete(id);
  for (const note of change.putNotes) notes.set(note.id, note);
  return {
    data: {
      notes: [...notes.values()],
      folders: change.meta.folders,
      tombstones: change.meta.tombstones,
    },
    activeId: change.meta.activeId,
  };
}

/** In-memory persistence for tests and environments without storage. */
export function createMemoryPersistence(initial: PersistedState | null = null) {
  let state = initial;
  let saves = 0;
  const listeners = new Set<() => void>();
  return {
    get saves() {
      return saves;
    },
    get state() {
      return state;
    },
    async load() {
      return state && structuredClone(state);
    },
    async save(change: PersistChange) {
      saves++;
      state = applyChange(state, change);
    },
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    /** Simulates a write made by another tab. */
    writeExternally(next: PersistedState) {
      state = next;
      listeners.forEach((l) => l());
    },
  } satisfies NotesPersistence & Record<string, unknown>;
}

/**
 * Fallback when IndexedDB is unavailable: the whole state as one
 * localStorage entry, synced across tabs through the `storage` event.
 */
export function createLocalStoragePersistence(storage: Storage): NotesPersistence {
  const read = () => deserialize(storage.getItem(STORAGE_KEY));
  const write = (change: PersistChange) =>
    storage.setItem(STORAGE_KEY, serialize(applyChange(read(), change)));
  return {
    load: async () => read(),
    save: async (change) => write(change),
    saveSync: write,
    subscribe(cb) {
      const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY) cb();
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}
