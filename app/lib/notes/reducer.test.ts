import { expect, test } from "@playwright/test";
import type { Note } from "@/app/types/note";
import {
  filterNotes,
  initialNotesState,
  notesReducer,
  sortNotes,
  type NotesState,
} from "@/app/lib/notes/reducer";

const note = (id: string, overrides: Partial<Note> = {}): Note => ({
  id,
  title: id,
  content: "",
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const stateWith = (notes: Note[], activeId: string | null = null): NotesState => ({
  ...initialNotesState,
  notes,
  activeId,
});

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
    note("1", { title: "Groceries", content: "milk" }),
    note("2", { title: "Work", content: "Ship the Feature" }),
  ];

  test("matches title or content, case-insensitively", () => {
    expect(filterNotes(notes, "grocer").map((n) => n.id)).toEqual(["1"]);
    expect(filterNotes(notes, "feature").map((n) => n.id)).toEqual(["2"]);
  });

  test("returns every note for a blank query", () => {
    expect(filterNotes(notes, "   ")).toHaveLength(2);
  });
});

test.describe("notesReducer", () => {
  test("create adds the note and makes it active", () => {
    const next = notesReducer(stateWith([note("a")], "a"), {
      type: "create",
      note: note("b"),
    });
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

  test("update returns the same state when nothing changed", () => {
    const state = stateWith([note("a", { title: "Same" })]);
    const next = notesReducer(state, {
      type: "update",
      id: "a",
      patch: { title: "Same" },
      now: 42,
    });
    expect(next).toBe(state);
  });

  test("delete of the active note selects the next note by sort order", () => {
    const state = stateWith(
      [
        note("a", { updatedAt: 1 }),
        note("b", { updatedAt: 3 }),
        note("c", { updatedAt: 2 }),
      ],
      "b"
    );
    const next = notesReducer(state, { type: "delete", id: "b" });
    expect(next.notes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(next.activeId).toBe("c");
    expect(next.lastDeleted?.id).toBe("b");
  });

  test("delete of the last note leaves nothing active", () => {
    const next = notesReducer(stateWith([note("a")], "a"), {
      type: "delete",
      id: "a",
    });
    expect(next.activeId).toBeNull();
  });

  test("delete of an inactive note keeps the selection", () => {
    const next = notesReducer(stateWith([note("a"), note("b")], "a"), {
      type: "delete",
      id: "b",
    });
    expect(next.activeId).toBe("a");
  });

  test("undoDelete restores the note and selects it", () => {
    const deleted = notesReducer(stateWith([note("a"), note("b")], "b"), {
      type: "delete",
      id: "b",
    });
    const restored = notesReducer(deleted, { type: "undoDelete" });
    expect(restored.notes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    expect(restored.activeId).toBe("b");
    expect(restored.lastDeleted).toBeNull();
  });

  test("undoDelete with nothing deleted is a no-op", () => {
    const state = stateWith([note("a")], "a");
    expect(notesReducer(state, { type: "undoDelete" }).notes).toBe(state.notes);
  });

  test("togglePin flips the flag", () => {
    const next = notesReducer(stateWith([note("a")]), { type: "togglePin", id: "a" });
    expect(next.notes[0].pinned).toBe(true);
  });

  test("select ignores unknown ids", () => {
    const state = stateWith([note("a")], "a");
    expect(notesReducer(state, { type: "select", id: "missing" })).toBe(state);
  });

  test("replace keeps a valid activeId and falls back to the top note otherwise", () => {
    const notes = [note("a", { updatedAt: 1 }), note("b", { updatedAt: 2 })];
    expect(
      notesReducer(initialNotesState, { type: "replace", notes, activeId: "a" }).activeId
    ).toBe("a");
    expect(
      notesReducer(initialNotesState, { type: "replace", notes, activeId: "gone" }).activeId
    ).toBe("b");
  });
});
