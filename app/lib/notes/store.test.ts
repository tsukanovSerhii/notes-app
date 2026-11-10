import { expect, test } from "@playwright/test";
import { createNotesStore, type KeyValueStorage, type Timers } from "@/app/lib/notes/store";
import { STORAGE_KEY, serialize } from "@/app/lib/notes/storage";
import type { Note } from "@/app/types/note";

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  writes = 0;
  failWrites = false;
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("QuotaExceededError");
    this.writes++;
    this.data.set(key, value);
  }
}

/** Manual clock: callbacks run only when the test calls `advance`. */
class FakeTimers implements Timers {
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

const seedNote: Note = {
  id: "welcome",
  title: "Welcome",
  content: "hi",
  pinned: true,
  createdAt: 0,
  updatedAt: 0,
};

function setup(storage = new MemoryStorage()) {
  let id = 0;
  const timers = new FakeTimers();
  const store = createNotesStore({
    getStorage: () => storage,
    persistDelayMs: 100,
    now: () => 1000,
    createId: () => `id-${++id}`,
    seed: () => [seedNote],
    timers,
  });
  return { store, storage, timers };
}

test.describe("notes store", () => {
  test("server snapshot is empty and not hydrated", () => {
    const { store } = setup();
    expect(store.getServerSnapshot()).toMatchObject({ notes: [], hydrated: false });
  });

  test("seeds the welcome note on the first visit and saves it", () => {
    const { store, storage } = setup();
    const snap = store.getSnapshot();
    expect(snap.hydrated).toBe(true);
    expect(snap.notes.map((n) => n.id)).toEqual(["welcome"]);
    expect(snap.activeId).toBe("welcome");
    expect(storage.getItem(STORAGE_KEY)).toContain("welcome");
  });

  test("does not re-seed when the user has deleted every note", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, serialize({ notes: [], activeId: null }));
    const { store } = setup(storage);
    expect(store.getSnapshot().notes).toEqual([]);
  });

  test("returns a stable snapshot reference between changes", () => {
    const { store } = setup();
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  test("debounces writes while typing", () => {
    const { store, storage, timers } = setup();
    const note = store.create();
    const writesBefore = storage.writes;

    store.update(note.id, { content: "a" });
    store.update(note.id, { content: "ab" });
    store.update(note.id, { content: "abc" });
    expect(store.getSnapshot().saveStatus).toBe("pending");
    expect(storage.writes).toBe(writesBefore);

    timers.advance(100);
    expect(storage.writes).toBe(writesBefore + 1);
    expect(store.getSnapshot().saveStatus).toBe("saved");
    expect(storage.getItem(STORAGE_KEY)).toContain('"abc"');
  });

  test("flush writes a pending change immediately", () => {
    const { store, storage } = setup();
    store.create();
    store.flush();
    expect(storage.getItem(STORAGE_KEY)).toContain("id-1");
  });

  test("reports an error instead of throwing when storage is full", () => {
    const { store, storage, timers } = setup();
    store.getSnapshot();
    storage.failWrites = true;
    store.create();
    timers.advance(100);
    expect(store.getSnapshot().saveStatus).toBe("error");
    expect(store.getSnapshot().notes).toHaveLength(2);
  });

  test("notifies subscribers on change", () => {
    const { store } = setup();
    let calls = 0;
    store.subscribe(() => calls++);
    store.create();
    expect(calls).toBeGreaterThan(0);
  });

  test("applies changes made in another tab without writing them back", () => {
    const { store, storage, timers } = setup();
    store.getSnapshot();
    const writes = storage.writes;
    const other: Note = { ...seedNote, id: "other", title: "From tab 2", pinned: false };

    store.receiveExternal(serialize({ notes: [seedNote, other], activeId: "other" }));
    timers.advance(1000);

    const snap = store.getSnapshot();
    expect(snap.notes.map((n) => n.id)).toEqual(["welcome", "other"]);
    expect(snap.activeId).toBe("welcome");
    expect(storage.writes).toBe(writes);
  });

  test("remove + undoDelete restores the note", () => {
    const { store } = setup();
    const note = store.create();
    store.remove(note.id);
    expect(store.getSnapshot().notes.some((n) => n.id === note.id)).toBe(false);
    store.undoDelete();
    expect(store.getSnapshot().activeId).toBe(note.id);
  });
});
