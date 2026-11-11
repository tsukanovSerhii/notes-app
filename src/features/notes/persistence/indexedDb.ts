import type { Note } from "@/features/notes/model/types";
import {
  STORAGE_KEY,
  deserialize,
  parseFolder,
  parseNote,
  parseTombstones,
  type PersistedState,
} from "@/features/notes/model/schema";
import {
  applyChange,
  type NotesPersistence,
  type PersistChange,
  type PersistedMeta,
} from "@/features/notes/persistence/persistence";

export const DB_NAME = "notevoid";
/** 2 added the local note history store. */
export const DB_VERSION = 2;
const NOTES = "notes";
const META = "meta";
/** Earlier versions of notes, written by the history feature. */
export const HISTORY_STORE = "history";
const META_KEY = "state";
/** Synchronous write-ahead journal for changes made while the page unloads. */
export const JOURNAL_KEY = "notevoid-journal";
const CHANNEL = "notevoid-db";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

export function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  const req = factory.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(NOTES)) db.createObjectStore(NOTES, { keyPath: "id" });
    if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    if (!db.objectStoreNames.contains(HISTORY_STORE)) {
      db.createObjectStore(HISTORY_STORE, { keyPath: "key", autoIncrement: true }).createIndex("noteId", "noteId");
    }
  };
  return request(req).then((db) => {
    // Let other tabs (or a "delete database" in dev tools) upgrade or delete.
    db.onversionchange = () => db.close();
    return db;
  });
}

/**
 * IndexedDB persistence. Each note is its own record, so typing in one note
 * writes one small record instead of re-serializing the whole collection.
 */
export function createIndexedDbPersistence(
  factory: IDBFactory,
  localStorage: Storage
): NotesPersistence {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDatabase(factory));
  const channel =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;

  const write = async (change: PersistChange) => {
    const tx = (await db()).transaction([NOTES, META], "readwrite");
    const notes = tx.objectStore(NOTES);
    for (const id of change.deleteNoteIds) notes.delete(id);
    for (const note of change.putNotes) notes.put(note);
    tx.objectStore(META).put(change.meta, META_KEY);
    await done(tx);
  };

  const readJournal = (): PersistChange | null => {
    try {
      const raw = localStorage.getItem(JOURNAL_KEY);
      return raw ? (JSON.parse(raw) as PersistChange) : null;
    } catch {
      return null;
    }
  };

  const loadFromDb = async (): Promise<PersistedState | null> => {
    const tx = (await db()).transaction([NOTES, META], "readonly");
    const [rawNotes, rawMeta] = await Promise.all([
      request(tx.objectStore(NOTES).getAll()),
      request(tx.objectStore(META).get(META_KEY)),
    ]);
    if (!rawMeta && rawNotes.length === 0) return null;
    const meta = (rawMeta ?? {}) as Partial<PersistedMeta>;
    return {
      data: {
        notes: rawNotes.map(parseNote).filter((n): n is Note => n !== null),
        folders: (Array.isArray(meta.folders) ? meta.folders : [])
          .map(parseFolder)
          .filter((f) => f !== null),
        tombstones: parseTombstones(meta.tombstones),
      },
      activeId: typeof meta.activeId === "string" ? meta.activeId : null,
    };
  };

  return {
    async load() {
      let state = await loadFromDb();

      // One-time migration from the localStorage format of earlier builds.
      if (state === null) {
        const legacy = deserialize(localStorage.getItem(STORAGE_KEY));
        if (legacy) {
          const { notes, folders, tombstones } = legacy.data;
          await write({
            putNotes: notes,
            deleteNoteIds: [],
            meta: { folders, tombstones, activeId: legacy.activeId },
          });
          localStorage.removeItem(STORAGE_KEY);
          state = legacy;
        }
      }

      // Replay changes that were journaled while the page was closing.
      const journal = readJournal();
      if (journal) {
        await write(journal);
        localStorage.removeItem(JOURNAL_KEY);
        state = applyChange(state, journal);
      }
      return state;
    },

    async save(change) {
      await write(change);
      channel?.postMessage("changed");
    },

    saveSync(change) {
      const previous = readJournal();
      const merged: PersistChange = previous
        ? {
            putNotes: [
              ...previous.putNotes.filter(
                (n) => !change.putNotes.some((c) => c.id === n.id)
              ),
              ...change.putNotes,
            ],
            deleteNoteIds: [...previous.deleteNoteIds, ...change.deleteNoteIds],
            meta: change.meta,
          }
        : change;
      try {
        localStorage.setItem(JOURNAL_KEY, JSON.stringify(merged));
      } catch {
        // Nothing more can be done while unloading.
      }
      void write(change)
        .then(() => {
          localStorage.removeItem(JOURNAL_KEY);
          channel?.postMessage("changed");
        })
        .catch(() => {});
    },

    subscribe(cb) {
      if (!channel) return () => {};
      const onMessage = () => cb();
      channel.addEventListener("message", onMessage);
      return () => channel.removeEventListener("message", onMessage);
    },
  };
}
