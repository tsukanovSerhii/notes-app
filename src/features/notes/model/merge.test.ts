import { expect, test } from "@playwright/test";
import { mergeData, reviveImported } from "@/features/notes/model/merge";
import { folder, note } from "@/features/notes/testing";
import type { NotesData } from "@/features/notes/model/types";

const data = (d: Partial<NotesData>): NotesData => ({
  notes: [],
  folders: [],
  tombstones: {},
  ...d,
});

const ids = (d: NotesData) => d.notes.map((n) => n.id).sort();

test.describe("mergeData", () => {
  test("takes the union of both replicas", () => {
    expect(ids(mergeData(data({ notes: [note("a")] }), data({ notes: [note("b")] })))).toEqual([
      "a",
      "b",
    ]);
  });

  test("the most recent edit of a note wins", () => {
    const merged = mergeData(
      data({ notes: [note("a", { title: "old", updatedAt: 1 })] }),
      data({ notes: [note("a", { title: "new", updatedAt: 2 })] })
    );
    expect(merged.notes).toEqual([note("a", { title: "new", updatedAt: 2 })]);
  });

  test("a deletion wins over older edits, a newer edit wins over the deletion", () => {
    const deletedLater = mergeData(
      data({ notes: [note("a", { updatedAt: 1 })] }),
      data({ tombstones: { a: 2 } })
    );
    expect(deletedLater.notes).toEqual([]);

    const editedLater = mergeData(
      data({ notes: [note("a", { updatedAt: 3 })] }),
      data({ tombstones: { a: 2 } })
    );
    expect(ids(editedLater)).toEqual(["a"]);
  });

  test("keeps the latest tombstone per id", () => {
    expect(mergeData(data({ tombstones: { a: 1 } }), data({ tombstones: { a: 5 } })).tombstones).toEqual({
      a: 5,
    });
  });

  test("a note keeps its folder reference when the folder is deleted or not seen yet", () => {
    const deleted = mergeData(
      data({ notes: [note("a", { folderId: "f", updatedAt: 1 })], folders: [folder("f")] }),
      data({ tombstones: { f: 5 } })
    );
    expect(deleted.folders).toEqual([]);
    expect(deleted.notes[0].folderId).toBe("f");

    // The folder can arrive later; clearing the reference would lose it.
    const early = mergeData(data({ notes: [note("a", { folderId: "f" })] }), data({}));
    expect(mergeData(early, data({ folders: [folder("f")] })).notes[0].folderId).toBe("f");
  });

  test("picks the same version on an updatedAt tie, whatever the order", () => {
    const left = data({
      notes: [note("a", { content: "from laptop", updatedAt: 5 })],
      folders: [folder("f", { name: "Work", updatedAt: 7 })],
    });
    const right = data({
      notes: [note("a", { content: "from phone", updatedAt: 5 })],
      folders: [folder("f", { name: "Job", updatedAt: 7 })],
    });
    const ab = mergeData(left, right);
    const ba = mergeData(right, left);
    expect(ab).toEqual(ba);
    expect(ab.notes).toHaveLength(1);
    expect(mergeData(ab, left)).toEqual(ab);
  });

  test("is commutative and idempotent", () => {
    const a = data({
      notes: [note("x", { updatedAt: 3 }), note("y", { updatedAt: 1 })],
      tombstones: { z: 4 },
    });
    const b = data({
      notes: [note("y", { updatedAt: 2, title: "b" }), note("z", { updatedAt: 3 })],
      folders: [folder("f")],
    });
    const ab = mergeData(a, b);
    const ba = mergeData(b, a);
    expect(ids(ab)).toEqual(ids(ba));
    expect(ab.tombstones).toEqual(ba.tombstones);
    expect(mergeData(ab, ab).notes.length).toBe(ab.notes.length);
    expect(ids(ab)).toEqual(["x", "y"]);
  });
});

test("reviveImported takes notes back out of the local trash", () => {
  const local = data({ notes: [note("a", { trashedAt: 50, updatedAt: 50 })] });
  const backup = data({ notes: [note("a", { content: "saved", updatedAt: 10 })] });
  const merged = reviveImported(local, backup, 20);
  expect(merged.notes).toEqual([note("a", { content: "saved", updatedAt: 51 })]);
});

test("reviveImported restores locally deleted notes with a fresh timestamp", () => {
  const local = data({ tombstones: { a: 10 } });
  const result = reviveImported(local, data({ notes: [note("a", { updatedAt: 1 })] }), 20);
  expect(result.notes[0].updatedAt).toBe(20);
  expect(result.tombstones).toEqual({});
});
