import { expect, test } from "@playwright/test";
import { createHistoryRecorder, createMemoryHistory, HISTORY_INTERVAL_MS } from "@/app/lib/notes/history";
import { createNotesStore } from "@/app/lib/notes/store";
import { createMemoryPersistence } from "@/app/lib/notes/persistence";
import { FakeTimers, note } from "@/app/lib/notes/testUtils";

async function setup() {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => void (t += ms) };
  const store = createNotesStore({
    getPersistence: () =>
      createMemoryPersistence({
        data: { notes: [note("a", { title: "Plan", content: "v1", editedAt: 5 })], folders: [], tombstones: {} },
        activeId: "a",
      }),
    timers: new FakeTimers(),
    now: clock.now,
  });
  await store.start();
  const history = createMemoryHistory();
  const recorder = createHistoryRecorder({ store, history, now: clock.now, keepLast: 3 });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { store, history, recorder, clock, settle };
}

test("the first edit keeps the original, then at most one version per interval", async () => {
  const { store, history, clock, settle } = await setup();
  store.update("a", { content: "v2" });
  store.update("a", { content: "v3" });
  clock.advance(60_000);
  store.update("a", { content: "v4" });
  await settle();
  expect((await history.list("a")).map((v) => v.content)).toEqual(["v1"]);

  clock.advance(HISTORY_INTERVAL_MS);
  store.update("a", { content: "v5" });
  await settle();
  // Newest first; each version is the text just before an edit.
  expect((await history.list("a")).map((v) => v.content)).toEqual(["v4", "v1"]);
});

test("changes other than title or text, and empty notes, do not create versions", async () => {
  const { store, history, settle } = await setup();
  store.togglePin("a");
  store.update("a", { tags: ["x"] });
  const fresh = store.create();
  store.update(fresh.id, { title: "Named" });
  await settle();
  expect(await history.list("a")).toEqual([]);
  expect(await history.list(fresh.id)).toEqual([]);
});

test("keeps only the newest versions of a note", async () => {
  const { store, history, clock, settle } = await setup();
  for (let i = 2; i <= 6; i++) {
    clock.advance(HISTORY_INTERVAL_MS);
    store.update("a", { content: `v${i}` });
  }
  await settle();
  expect((await history.list("a")).map((v) => v.content)).toEqual(["v5", "v4", "v3"]);
});

test("keep() saves the current text right away, e.g. before a restore", async () => {
  const { store, history, recorder } = await setup();
  await recorder.keep(store.getSnapshot().notes[0]);
  expect((await history.list("a"))[0]).toMatchObject({ title: "Plan", content: "v1", at: 5 });
});

test("text replaced by a sync merge is kept too", async () => {
  const { store, history, settle } = await setup();
  store.merge(
    { notes: [note("a", { title: "Plan", content: "from another device", updatedAt: 9e12, editedAt: 9e12 })], folders: [], tombstones: {} },
    "sync"
  );
  await settle();
  expect((await history.list("a")).map((v) => v.content)).toEqual(["v1"]);
});
