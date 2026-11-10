import { expect, test } from "@playwright/test";
import {
  collectTags,
  filterNotes,
  initialNotesState,
  notesReducer,
  sortNotes,
  type NotesState,
} from "@/app/lib/notes/reducer";
import { folder, note } from "@/app/lib/notes/testUtils";
import type { Note } from "@/app/types/note";

const stateWith = (
  notes: Note[],
  activeId: string | null = null,
  extra: Partial<NotesState> = {}
): NotesState => ({ ...initialNotesState, notes, activeId, ...extra });

test.describe("sortNotes", () => {
  test("puts pinned notes first, then the most recently updated", () => {
    const sorted = sortNotes([
      note("old", { updatedAt: 1 }),
      note("new", { updatedAt: 3 }),
      note("pinned", { updatedAt: 0, pinned: true }),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["pinned", "new", "old"]);
  });

  test("does not mutate its input", () => {
    const input = [note("a", { updatedAt: 1 }), note("b", { updatedAt: 2 })];
    sortNotes(input);
    expect(input.map((n) => n.id)).toEqual(["a", "b"]);
  });
});

test.describe("filterNotes", () => {
  const notes = [
    note("1", { title: "Groceries", content: "milk", tags: ["home"], folderId: "f1" }),
    note("2", { title: "Work", content: "Ship the Feature", tags: ["work", "urgent"] }),
  ];

  test("matches title, content or tag, case-insensitively", () => {
    expect(filterNotes(notes, "grocer").map((n) => n.id)).toEqual(["1"]);
    expect(filterNotes(notes, "feature").map((n) => n.id)).toEqual(["2"]);
    expect(filterNotes(notes, "#urg").map((n) => n.id)).toEqual(["2"]);
  });

  test("filters by folder and by tag", () => {
    expect(filterNotes(notes, { folderId: "f1" }).map((n) => n.id)).toEqual(["1"]);
    expect(filterNotes(notes, { tag: "work" }).map((n) => n.id)).toEqual(["2"]);
    expect(filterNotes(notes, { folderId: "f1", tag: "work" })).toEqual([]);
  });

  test("returns every note for a blank query", () => {
    expect(filterNotes(notes, "   ")).toHaveLength(2);
  });
});

test("collectTags counts tags and sorts by frequency", () => {
  const tags = collectTags([note("1", { tags: ["b", "a"] }), note("2", { tags: ["a"] })]);
  expect(tags).toEqual([
    { tag: "a", count: 2 },
    { tag: "b", count: 1 },
  ]);
});

test.describe("notesReducer", () => {
  test("create adds the note and makes it active", () => {
    const next = notesReducer(stateWith([note("a")], "a"), { type: "create", note: note("b") });
    expect(next.notes.map((n) => n.id)).toEqual(["b", "a"]);
    expect(next.activeId).toBe("b");
  });

  test("update patches the note and bumps updatedAt", () => {
    const next = notesReducer(stateWith([note("a")]), {
      type: "update",
      id: "a",
      patch: { title: "Hello" },
      now: 42,
    });
    expect(next.notes[0]).toMatchObject({ title: "Hello", updatedAt: 42 });
  });

  test("update normalizes tags", () => {
    const next = notesReducer(stateWith([note("a")]), {
      type: "update",
      id: "a",
      patch: { tags: ["#Work", " work ", "Side Project"] },
      now: 1,
    });
    expect(next.notes[0].tags).toEqual(["work", "side-project"]);
  });

  test("update returns the same state when nothing changed", () => {
    const state = stateWith([note("a", { title: "Same", tags: ["x"] })]);
    const next = notesReducer(state, {
      type: "update",
      id: "a",
      patch: { title: "Same", tags: ["x"] },
      now: 42,
    });
    expect(next).toBe(state);
  });

  test("delete selects the next note and leaves a tombstone", () => {
    const state = stateWith(
      [note("a", { updatedAt: 1 }), note("b", { updatedAt: 3 }), note("c", { updatedAt: 2 })],
      "b"
    );
    const next = notesReducer(state, { type: "delete", id: "b", now: 9 });
    expect(next.notes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(next.activeId).toBe("c");
    expect(next.lastDeleted?.id).toBe("b");
    expect(next.tombstones).toEqual({ b: 9 });
  });

  test("delete of the last note leaves nothing active", () => {
    const next = notesReducer(stateWith([note("a")], "a"), { type: "delete", id: "a", now: 1 });
    expect(next.activeId).toBeNull();
  });

  test("undoDelete restores the note, lifts the tombstone and bumps updatedAt", () => {
    const deleted = notesReducer(stateWith([note("a"), note("b")], "b"), {
      type: "delete",
      id: "b",
      now: 5,
    });
    const restored = notesReducer(deleted, { type: "undoDelete", now: 6 });
    expect(restored.notes.find((n) => n.id === "b")?.updatedAt).toBe(6);
    expect(restored.activeId).toBe("b");
    expect(restored.tombstones).toEqual({});
    expect(restored.lastDeleted).toBeNull();
  });

  test("undoDelete with nothing deleted is a no-op", () => {
    const state = stateWith([note("a")], "a");
    expect(notesReducer(state, { type: "undoDelete", now: 1 }).notes).toBe(state.notes);
  });

  test("togglePin flips the flag and bumps updatedAt for sync", () => {
    const next = notesReducer(stateWith([note("a")]), { type: "togglePin", id: "a", now: 3 });
    expect(next.notes[0]).toMatchObject({ pinned: true, updatedAt: 3 });
  });

  test("select ignores unknown ids", () => {
    const state = stateWith([note("a")], "a");
    expect(notesReducer(state, { type: "select", id: "missing" })).toBe(state);
  });

  test("replace keeps a valid activeId and falls back to the top note otherwise", () => {
    const data = {
      notes: [note("a", { updatedAt: 1 }), note("b", { updatedAt: 2 })],
      folders: [],
      tombstones: {},
    };
    expect(notesReducer(initialNotesState, { type: "replace", data, activeId: "a" }).activeId).toBe("a");
    expect(notesReducer(initialNotesState, { type: "replace", data, activeId: "gone" }).activeId).toBe("b");
  });

  test("deleting a folder keeps its notes and moves them out", () => {
    const state = stateWith([note("a", { folderId: "f" }), note("b")], "a", {
      folders: [folder("f")],
    });
    const next = notesReducer(state, { type: "deleteFolder", id: "f", now: 7 });
    expect(next.folders).toEqual([]);
    expect(next.notes.find((n) => n.id === "a")).toMatchObject({ folderId: null, updatedAt: 7 });
    expect(next.tombstones.f).toBe(7);
  });

  test("renameFolder trims and ignores blank names", () => {
    const state = stateWith([], null, { folders: [folder("f", { name: "Old" })] });
    expect(
      notesReducer(state, { type: "renameFolder", id: "f", name: "  New ", now: 2 }).folders[0]
    ).toMatchObject({ name: "New", updatedAt: 2 });
    expect(notesReducer(state, { type: "renameFolder", id: "f", name: "  ", now: 2 })).toBe(state);
  });

  test("merge in sync mode keeps object identity of unchanged notes", () => {
    const a = note("a", { updatedAt: 1 });
    const next = notesReducer(stateWith([a], "a"), {
      type: "merge",
      mode: "sync",
      now: 10,
      data: { notes: [{ ...a }, note("b", { updatedAt: 2 })], folders: [], tombstones: {} },
    });
    expect(next.notes.find((n) => n.id === "a")).toBe(a);
    expect(next.notes).toHaveLength(2);
  });

  test("merge in import mode restores notes that were deleted locally", () => {
    const state = stateWith([], null, { tombstones: { a: 50 } });
    const data = { notes: [note("a", { updatedAt: 10 })], folders: [], tombstones: {} };
    expect(notesReducer(state, { type: "merge", mode: "sync", now: 99, data }).notes).toEqual([]);
    const imported = notesReducer(state, { type: "merge", mode: "import", now: 99, data });
    expect(imported.notes[0]).toMatchObject({ id: "a", updatedAt: 99 });
    expect(imported.tombstones).toEqual({});
  });
});
