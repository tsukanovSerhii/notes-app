import type { Folder, Note } from "@/app/types/note";
import type { SealedNote } from "@/app/lib/sync/wire";
import type { Timers } from "@/app/lib/notes/store";

export const note = (id: string, overrides: Partial<Note> = {}): Note => ({
  id,
  title: id,
  content: "",
  pinned: false,
  tags: [],
  folderId: null,
  createdAt: 0,
  updatedAt: 0,
  editedAt: 0,
  editedBy: null,
  trashedAt: null,
  conflictOf: null,
  ...overrides,
});

/** A sealed note as the server sees it; the text is opaque. */
export const sealedNote = (id: string, overrides: Partial<SealedNote> = {}): SealedNote => ({
  id,
  pinned: false,
  folderId: null,
  createdAt: 0,
  updatedAt: 0,
  editedAt: 0,
  editedBy: null,
  trashedAt: null,
  textHash: `hash-${id}-0`,
  sealed: `sealed${id.replace(/[^A-Za-z0-9_-]/g, "")}`,
  conflictOf: null,
  ...overrides,
});

export const folder = (id: string, overrides: Partial<Folder> = {}): Folder => ({
  id,
  name: id,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

/** Manual clock: callbacks run only when the test calls `advance`. */
export class FakeTimers implements Timers {
  private time = 0;
  private nextId = 1;
  private queue = new Map<number, { at: number; cb: () => void }>();
  setTimeout(cb: () => void, ms: number) {
    const id = this.nextId++;
    this.queue.set(id, { at: this.time + ms, cb });
    return id;
  }
  clearTimeout(handle: unknown) {
    this.queue.delete(handle as number);
  }
  advance(ms: number) {
    this.time += ms;
    for (const [id, job] of [...this.queue]) {
      if (job.at <= this.time) {
        this.queue.delete(id);
        job.cb();
      }
    }
  }
}

/** Lets pending promise callbacks run. */
export const settle = () => new Promise((r) => setTimeout(r, 0));
