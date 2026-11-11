import { expect, test } from "@playwright/test";
import { conflictCopy, findLostEdits } from "@/app/lib/sync/conflicts";
import { sealedNote } from "@/app/lib/notes/testUtils";
import type { SealedData, SealedNote } from "@/app/lib/sync/wire";

const data = (notes: SealedNote[], tombstones: SealedData["tombstones"] = {}): SealedData => ({
  notes,
  folders: [],
  tombstones,
});
const ids = (notes: SealedNote[]) => notes.map((n) => n.id);
const ME = "device-me";
// The server compares keyed hashes of the text; equal text, equal hash.
const text = (t: string) => ({ textHash: `hash-${t}` });
const mine = (id: string, t: string, o: Partial<SealedNote>) =>
  sealedNote(id, { editedBy: ME, ...text(t), ...o });
const theirs = (id: string, t: string, o: Partial<SealedNote>) =>
  sealedNote(id, { editedBy: "device-other", ...text(t), ...o });
const lost = (incoming: SealedData, stored: SealedData, since: number | null, device: string | null = ME) =>
  findLostEdits(incoming, stored, since, device, (n) => n.textHash);

test.describe("findLostEdits", () => {
  test("keeps the device's unsynced edit when a newer edit elsewhere wins", () => {
    const incoming = data([mine("a", "mine", { editedAt: 20, updatedAt: 20 })]);
    const stored = data([theirs("a", "theirs", { editedAt: 25, updatedAt: 25 })]);
    expect(lost(incoming, stored, 10)).toEqual(incoming.notes);
  });

  test("keeps the other device's unseen edit when the device's edit wins", () => {
    const incoming = data([mine("a", "mine", { editedAt: 30, updatedAt: 30 })]);
    const stored = data([theirs("a", "theirs", { editedAt: 25, updatedAt: 25 })]);
    expect(lost(incoming, stored, 10)).toEqual(stored.notes);
  });

  test("ignores text the device had already synced or already seen", () => {
    const synced = data([mine("a", "old", { editedAt: 5, updatedAt: 5 })]);
    const newer = data([theirs("a", "new", { editedAt: 25, updatedAt: 25 })]);
    expect(lost(synced, newer, 10)).toEqual([]);

    const seen = data([theirs("a", "seen", { editedAt: 8, updatedAt: 8 })]);
    const edited = data([mine("a", "edited", { editedAt: 30, updatedAt: 30 })]);
    expect(lost(edited, seen, 10)).toEqual([]);
  });

  test("another device's text received and sent back is not this device's edit", () => {
    const incoming = data([theirs("a", "v1", { editedAt: 20, updatedAt: 20 })]);
    const stored = data([theirs("a", "v2", { editedAt: 25, updatedAt: 25 })]);
    expect(lost(incoming, stored, 10)).toEqual([]);
  });

  test("the device's own text from a lost reply is not a conflict with itself", () => {
    const stored = data([mine("a", "typing", { editedAt: 20, updatedAt: 20 })]);
    const incoming = data([mine("a", "typing more", { editedAt: 25, updatedAt: 25 })]);
    expect(lost(incoming, stored, 10)).toEqual([]);
  });

  test("catches text lost to a newer change that was not an edit (a pin elsewhere)", () => {
    const incoming = data([mine("a", "mine", { editedAt: 20, updatedAt: 20 })]);
    const stored = data([theirs("a", "before", { editedAt: 1, updatedAt: 30, pinned: true })]);
    expect(ids(lost(incoming, stored, 10))).toEqual(["a"]);
  });

  test("catches an unsynced edit to a note deleted for good elsewhere", () => {
    const incoming = data([mine("a", "mine", { editedAt: 20, updatedAt: 20 })]);
    expect(ids(lost(incoming, data([], { a: 30 }), 10))).toEqual(["a"]);
  });

  test("before the first sync, only notes edited after creation count", () => {
    const untouched = mine("welcome", "hi", { createdAt: 5, editedAt: 5, updatedAt: 60 });
    const edited = mine("b", "mine", { createdAt: 5, editedAt: 9, updatedAt: 9 });
    const stored = data([
      theirs("welcome", "hi", { createdAt: 5, editedAt: 5, updatedAt: 5 }),
      theirs("b", "theirs", { editedAt: 50, updatedAt: 50 }),
    ]);
    expect(ids(lost(data([untouched, edited]), stored, null))).toEqual(["b"]);
  });
});

test("conflictCopy marks a fresh, unpinned copy with a stable id", () => {
  const original = sealedNote("a", { pinned: true, editedAt: 7 });
  const copy = conflictCopy(original, 99);
  expect(copy).toMatchObject({
    id: "a~conflict-7",
    sealed: original.sealed,
    textHash: original.textHash,
    pinned: false,
    conflictOf: "a",
    createdAt: 99,
    updatedAt: 99,
    editedAt: 99,
  });
  // A retried request produces the same copy instead of a second one.
  expect(conflictCopy(original, 120).id).toBe(copy.id);
  // A copy of a copy still points at the original note.
  expect(conflictCopy(copy, 100).conflictOf).toBe("a");
});
