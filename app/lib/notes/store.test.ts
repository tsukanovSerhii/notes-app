import { expect, test } from "@playwright/test";
import { createNotesStore } from "@/app/lib/notes/store";
import { createMemoryPersistence } from "@/app/lib/notes/persistence";
import type { PersistedState } from "@/app/lib/notes/storage";
import { FakeTimers, note, settle } from "@/app/lib/notes/testUtils";

const seedNote = note("welcome", { title: "Welcome", pinned: true });

async function setup(initial: PersistedState | null = null) {
  let id = 0;
  const timers = new FakeTimers();
  const persistence = createMemoryPersistence(initial);
  const store = createNotesStore({
    getPersistence: () => persistence,
    persistDelayMs: 100,
    now: () => 1000,
    createId: () => `id-${++id}`,
    seed: () => [seedNote],
    timers,
  });
  await store.start();
  await settle();
  return { store, persistence, timers };
}

test.describe("notes store", () => {
  test("server snapshot is empty and not hydrated", async () => {
    const store = createNotesStore({ getPersistence: () => null });
    expect(store.getServerSnapshot()).toMatchObject({ notes: [], hydrated: false });
    await store.start();
    expect(store.getSnapshot().hydrated).toBe(false);
  });

  test("seeds the welcome note on the first visit and saves it", async () => {
    const { store, persistence } = await setup();
    const snap = store.getSnapshot();
    expect(snap.hydrated).toBe(true);
    expect(snap.notes.map((n) => n.id)).toEqual(["welcome"]);
    expect(snap.activeId).toBe("welcome");
    expect(persistence.state?.data.notes.map((n) => n.id)).toEqual(["welcome"]);
  });

  test("does not re-seed when the user has deleted every note", async () => {
    const { store } = await setup({
      data: { notes: [], folders: [], tombstones: {} },
      activeId: null,
    });
    expect(store.getSnapshot().notes).toEqual([]);
  });

  test("returns a stable snapshot reference between changes", async () => {
    const { store } = await setup();
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  test("debounces writes and only writes the notes that changed", async () => {
    const { store, persistence, timers } = await setup();
    const savesBefore = persistence.saves;
    const n = store.create();
    store.update(n.id, { content: "a" });
    store.update(n.id, { content: "abc" });
    expect(store.getSnapshot().saveStatus).toBe("pending");
    expect(persistence.saves).toBe(savesBefore);

    timers.advance(100);
    await settle();
    expect(persistence.saves).toBe(savesBefore + 1);
    expect(store.getSnapshot().saveStatus).toBe("saved");
    expect(persistence.state?.data.notes.find((x) => x.id === n.id)?.content).toBe("abc");
  });

  test("records deletions and folders in storage", async () => {
    const { store, persistence } = await setup();
    expect(store.createFolder("Work")).not.toBeNull();
    store.remove("welcome");
    await store.flush();
    expect(persistence.state?.data.notes).toEqual([]);
    expect(persistence.state?.data.folders.map((x) => x.name)).toEqual(["Work"]);
    expect(persistence.state?.data.tombstones).toEqual({ welcome: 1000 });
  });

  test("reports an error instead of throwing when a write fails", async () => {
    const { store, persistence } = await setup();
    persistence.save = async () => {
      throw new Error("QuotaExceededError");
    };
    store.create();
    await store.flush();
    expect(store.getSnapshot().saveStatus).toBe("error");
    expect(store.getSnapshot().notes).toHaveLength(2);
  });

  test("notifies data subscribers on local edits but not on selection", async () => {
    const { store } = await setup();
    let calls = 0;
    store.subscribeData(() => calls++);
    store.select("welcome");
    expect(calls).toBe(0);
    store.create();
    expect(calls).toBe(1);
  });

  test("picks up writes from another tab and keeps unsaved local edits", async () => {
    const { store, persistence } = await setup();
    store.update("welcome", { content: "local edit" });

    persistence.writeExternally({
      data: {
        notes: [note("welcome", { content: "stale" }), note("other", { title: "From tab 2" })],
        folders: [],
        tombstones: {},
      },
      activeId: "other",
    });
    await settle();

    const snap = store.getSnapshot();
    expect(snap.notes.map((n) => n.id).sort()).toEqual(["other", "welcome"]);
    expect(snap.notes.find((n) => n.id === "welcome")?.content).toBe("local edit");
    expect(snap.activeId).toBe("welcome");
  });

  test("remove + undoDelete restores the note", async () => {
    const { store } = await setup();
    const n = store.create();
    store.remove(n.id);
    expect(store.getSnapshot().notes.some((x) => x.id === n.id)).toBe(false);
    store.undoDelete();
    expect(store.getSnapshot().activeId).toBe(n.id);
  });

  test("flushSync uses the synchronous path when available", async () => {
    const { store, persistence } = await setup();
    const journal: unknown[] = [];
    Object.assign(persistence, { saveSync: (c: unknown) => journal.push(c) });
    store.create();
    store.flushSync();
    expect(journal).toHaveLength(1);
  });
});
