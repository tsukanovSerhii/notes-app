import { expect, test } from "@playwright/test";
import {
  deserialize,
  normalizeTag,
  parseData,
  parseNote,
  serialize,
} from "@/app/lib/notes/storage";

const empty = { notes: [], folders: [], tombstones: {} };

test.describe("deserialize", () => {
  test("returns null when nothing is stored (first visit)", () => {
    expect(deserialize(null)).toBeNull();
  });

  test("survives corrupt JSON", () => {
    expect(deserialize("{not json")).toEqual({ data: empty, activeId: null });
  });

  test("reads the legacy bare-array format and adds missing fields", () => {
    const legacy = JSON.stringify([
      { id: "a", title: "Old", content: "x", createdAt: 1, updatedAt: 2 },
    ]);
    expect(deserialize(legacy)?.data.notes).toEqual([
      {
        id: "a",
        title: "Old",
        content: "x",
        pinned: false,
        tags: [],
        folderId: null,
        createdAt: 1,
        updatedAt: 2,
        editedAt: 2,
        trashedAt: null,
      },
    ]);
  });

  test("reads the v1 payload", () => {
    const v1 = JSON.stringify({ version: 1, notes: [{ id: "a" }], activeId: "a" });
    const result = deserialize(v1);
    expect(result?.activeId).toBe("a");
    expect(result?.data.notes.map((n) => n.id)).toEqual(["a"]);
  });

  test("round-trips the current format", () => {
    const state = {
      data: {
        notes: [
          {
            id: "a",
            title: "T",
            content: "C",
            pinned: true,
            tags: ["x"],
            folderId: "f",
            createdAt: 1,
            updatedAt: 3,
            editedAt: 2,
            trashedAt: 3,
          },
        ],
        folders: [{ id: "f", name: "Work", createdAt: 1, updatedAt: 1 }],
        tombstones: { gone: 5 },
      },
      activeId: "a",
    };
    expect(deserialize(serialize(state))).toEqual(state);
  });
});

test("parseData drops invalid entries, duplicates and dangling folder ids", () => {
  const result = parseData({
    notes: [null, 42, { title: "no id" }, { id: "a", folderId: "missing" }, { id: "a" }],
    folders: [{ id: "f" }, { id: "g", name: "  Ok  " }],
    tombstones: { x: 1, y: "nope" },
  });
  expect(result.notes.map((n) => [n.id, n.folderId])).toEqual([["a", null]]);
  expect(result.folders.map((f) => f.name)).toEqual(["Ok"]);
  expect(result.tombstones).toEqual({ x: 1 });
});

test("parseNote fills safe defaults for wrongly typed fields", () => {
  expect(parseNote({ id: "a", title: 1, content: null, tags: ["A", 3], createdAt: 5 })).toEqual({
    id: "a",
    title: "Untitled",
    content: "",
    pinned: false,
    tags: ["a"],
    folderId: null,
    createdAt: 5,
    updatedAt: 5,
    editedAt: 5,
    trashedAt: null,
  });
});

test("normalizeTag", () => {
  expect(normalizeTag("  #Side Project ")).toBe("side-project");
  expect(normalizeTag("###")).toBe("");
});
