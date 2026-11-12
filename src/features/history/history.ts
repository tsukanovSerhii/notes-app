import type { Note } from "@/features/notes/model/types";
import type { NotesStore } from "@/features/notes/state/store";
import { HISTORY_STORE } from "@/features/notes/persistence/indexedDb";

/** A note's title and text as they were at `at` (when that text was written). */
export interface NoteVersion {
  noteId: string;
  at: number;
  title: string;
  content: string;
}

export interface HistoryStore {
  add(version: NoteVersion): Promise<void>;
  /** Newest first. */
  list(noteId: string): Promise<NoteVersion[]>;
  /** Keeps only the newest `keep` versions of a note. */
  prune(noteId: string, keep: number): Promise<void>;
  /** The text of every saved version, e.g. to see which attachments they still show. */
  contents(): Promise<string[]>;
}

export const HISTORY_INTERVAL_MS = 5 * 60 * 1000;
export const HISTORY_KEEP = 30;

const byNewest = (a: NoteVersion, b: NoteVersion) => b.at - a.at;

export function createMemoryHistory(): HistoryStore & { versions: NoteVersion[] } {
  const versions: NoteVersion[] = [];
  return {
    versions,
    async add(v) {
      versions.push({ ...v });
    },
    async list(id) {
      return versions.filter((v) => v.noteId === id).sort(byNewest);
    },
    async contents() {
      return versions.map((v) => v.content);
    },
    async prune(id, keep) {
      const drop = new Set(versions.filter((v) => v.noteId === id).sort(byNewest).slice(keep));
      for (let i = versions.length - 1; i >= 0; i--) if (drop.has(versions[i])) versions.splice(i, 1);
    },
  };
}

/** Versions in their own IndexedDB object store, indexed by note. */
export function createIndexedDbHistory(db: () => Promise<IDBDatabase>): HistoryStore {
  const request = <T>(req: IDBRequest<T>) =>
    new Promise<T>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const done = (tx: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  const forNote = async (id: string) => {
    const tx = (await db()).transaction(HISTORY_STORE, "readonly");
    const rows = await request(tx.objectStore(HISTORY_STORE).index("noteId").getAll(id));
    return (rows as (NoteVersion & { key: number })[]).sort(byNewest);
  };
  return {
    async add(v) {
      const tx = (await db()).transaction(HISTORY_STORE, "readwrite");
      tx.objectStore(HISTORY_STORE).add({ ...v });
      await done(tx);
    },
    async list(id) {
      return (await forNote(id)).map(({ noteId, at, title, content }) => ({ noteId, at, title, content }));
    },
    async contents() {
      const tx = (await db()).transaction(HISTORY_STORE, "readonly");
      const rows = (await request(tx.objectStore(HISTORY_STORE).getAll())) as NoteVersion[];
      return rows.map((v) => v.content);
    },
    async prune(id, keep) {
      const old = (await forNote(id)).slice(keep);
      if (old.length === 0) return;
      const tx = (await db()).transaction(HISTORY_STORE, "readwrite");
      for (const v of old) tx.objectStore(HISTORY_STORE).delete(v.key);
      await done(tx);
    },
  };
}

export interface HistoryRecorder {
  /** Saves `note` as it is now, e.g. before restoring an older version over it. */
  keep(note: Note): Promise<void>;
  stop(): void;
}

/**
 * Watches the store and keeps earlier versions of notes. When a note's text
 * changes, the version before the change is saved if the note's last saved
 * version is at least `intervalMs` old: the first edit after opening the app
 * keeps the original, and a long editing session keeps a version every few
 * minutes. Text overwritten by sync is kept the same way.
 */
export function createHistoryRecorder({
  store,
  history,
  now = Date.now,
  intervalMs = HISTORY_INTERVAL_MS,
  keepLast = HISTORY_KEEP,
}: {
  store: Pick<NotesStore, "getSnapshot" | "subscribe">;
  history: HistoryStore;
  now?: () => number;
  intervalMs?: number;
  keepLast?: number;
}): HistoryRecorder {
  type Seen = Pick<Note, "title" | "content" | "editedAt">;
  const seen = new Map<string, Seen>();
  const lastSaved = new Map<string, number>();
  let lastNotes: readonly Note[] | null = null;
  let chain = Promise.resolve();

  const save = (noteId: string, v: Seen) => {
    lastSaved.set(noteId, now());
    chain = chain
      .then(() => history.add({ noteId, at: v.editedAt, title: v.title, content: v.content }))
      .then(() => history.prune(noteId, keepLast))
      .catch(() => {
        // History is a convenience; a failed write must not disturb editing.
      });
    return chain;
  };

  const check = () => {
    const snap = store.getSnapshot();
    if (!snap.hydrated || snap.notes === lastNotes) return;
    const first = lastNotes === null;
    lastNotes = snap.notes;
    for (const n of snap.notes) {
      const prev = seen.get(n.id);
      const changed = prev && (prev.title !== n.title || prev.content !== n.content);
      // An empty note (one just created, say) has nothing worth going back to.
      const worthKeeping = changed && prev.content.trim() !== "";
      if (!first && worthKeeping && now() - (lastSaved.get(n.id) ?? -Infinity) >= intervalMs) {
        void save(n.id, prev);
      }
      if (!prev || changed) seen.set(n.id, { title: n.title, content: n.content, editedAt: n.editedAt });
    }
  };

  const unsubscribe = store.subscribe(check);
  check();

  return {
    keep: (note) => save(note.id, note),
    stop: unsubscribe,
  };
}
