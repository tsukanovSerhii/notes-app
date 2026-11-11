import { expect, test } from "@playwright/test";
import { CONFLICT_SUFFIX, conflictCopy, findLostEdits } from "@/app/lib/sync/conflicts";
import { note } from "@/app/lib/notes/testUtils";
import type { Note, NotesData } from "@/app/types/note";

const data = (notes: Note[], tombstones: NotesData["tombstones"] = {}): NotesData => ({
  notes,
  folders: [],
  tombstones,
});
const ids = (notes: Note[]) => notes.map((n) => n.id);
const ME = "device-me";
const mine = (id: string, o: Partial<Note>) => note(id, { editedBy: ME, ...o });
const theirs = (id: string, o: Partial<Note>) => note(id, { editedBy: "device-other", ...o });

test.describe("findLostEdits", () => {
  test("keeps the device's unsynced edit when a newer edit elsewhere wins", () => {
    const incoming = data([mine("a", { content: "mine", editedAt: 20, updatedAt: 20 })]);
    const stored = data([theirs("a", { content: "theirs", editedAt: 25, updatedAt: 25 })]);
    expect(findLostEdits(incoming, stored, 10, ME)).toEqual(incoming.notes);
  });

  test("keeps the other device's unseen edit when the device's edit wins", () => {
    const incoming = data([mine("a", { content: "mine", editedAt: 30, updatedAt: 30 })]);
    const stored = data([theirs("a", { content: "theirs", editedAt: 25, updatedAt: 25 })]);
    expect(findLostEdits(incoming, stored, 10, ME)).toEqual(stored.notes);
  });

  test("ignores text the device had already synced or already seen", () => {
    const synced = data([mine("a", { content: "old", editedAt: 5, updatedAt: 5 })]);
    const newer = data([theirs("a", { content: "new", editedAt: 25, updatedAt: 25 })]);
    expect(findLostEdits(synced, newer, 10, ME)).toEqual([]);

    const seen = data([theirs("a", { content: "seen", editedAt: 8, updatedAt: 8 })]);
    const edited = data([mine("a", { content: "edited", editedAt: 30, updatedAt: 30 })]);
    expect(findLostEdits(edited, seen, 10, ME)).toEqual([]);
  });

  test("another device's text received and sent back is not this device's edit", () => {
    // We got their v1 after our last snapshot and send it back; they have v2 since.
    const incoming = data([theirs("a", { content: "v1", editedAt: 20, updatedAt: 20 })]);
    const stored = data([theirs("a", { content: "v2", editedAt: 25, updatedAt: 25 })]);
    expect(findLostEdits(incoming, stored, 10, ME)).toEqual([]);
  });

  test("the device's own text from a lost reply is not a conflict with itself", () => {
    const stored = data([mine("a", { content: "typing", editedAt: 20, updatedAt: 20 })]);
    const incoming = data([mine("a", { content: "typing more", editedAt: 25, updatedAt: 25 })]);
    expect(findLostEdits(incoming, stored, 10, ME)).toEqual([]);
  });

  test("catches text lost to a newer change that was not an edit (a pin elsewhere)", () => {
    const incoming = data([mine("a", { content: "mine", editedAt: 20, updatedAt: 20 })]);
    const stored = data([theirs("a", { content: "before", editedAt: 1, updatedAt: 30, pinned: true })]);
    expect(ids(findLostEdits(incoming, stored, 10, ME))).toEqual(["a"]);
  });

  test("catches an unsynced edit to a note deleted for good elsewhere", () => {
    const incoming = data([mine("a", { content: "mine", editedAt: 20, updatedAt: 20 })]);
    expect(ids(findLostEdits(incoming, data([], { a: 30 }), 10, ME))).toEqual(["a"]);
  });

  test("before the first sync, only notes edited after creation count", () => {
    const untouched = mine("welcome", { content: "hi", createdAt: 5, editedAt: 5, updatedAt: 60 });
    const edited = mine("b", { content: "mine", createdAt: 5, editedAt: 9, updatedAt: 9 });
    const stored = data([
      theirs("welcome", { content: "hi", createdAt: 5, editedAt: 5, updatedAt: 5 }),
      theirs("b", { content: "theirs", editedAt: 50, updatedAt: 50 }),
    ]);
    expect(ids(findLostEdits(data([untouched, edited]), stored, null, ME))).toEqual(["b"]);
  });
});

test("conflictCopy is a fresh, unpinned note with a stable id and a marked title", () => {
  const lost = note("a", { title: "Plan", pinned: true, content: "mine", editedAt: 7 });
  const copy = conflictCopy(lost, 99);
  expect(copy).toMatchObject({
    id: "a~conflict-7",
    title: `Plan${CONFLICT_SUFFIX}`,
    content: "mine",
    pinned: false,
    createdAt: 99,
    updatedAt: 99,
    editedAt: 99,
  });
  // A retried request produces the same copy instead of a second one.
  expect(conflictCopy(lost, 120).id).toBe(copy.id);
  expect(conflictCopy(copy, 100).title).toBe(`Plan${CONFLICT_SUFFIX}`);
});
