import { expect, test } from "@playwright/test";
import { deserialize, parseNote, serialize } from "@/app/lib/notes/storage";

test.describe("deserialize", () => {
  test("returns null when nothing is stored (first visit)", () => {
    expect(deserialize(null)).toBeNull();
  });

  test("survives corrupt JSON", () => {
    expect(deserialize("{not json")).toEqual({ notes: [], activeId: null });
  });

  test("reads the legacy bare-array format and adds missing fields", () => {
    const legacy = JSON.stringify([
      { id: "a", title: "Old", content: "x", createdAt: 1, updatedAt: 2 },
    ]);
    expect(deserialize(legacy)).toEqual({
      notes: [{ id: "a", title: "Old", content: "x", pinned: false, createdAt: 1, updatedAt: 2 }],
      activeId: null,
    });
  });

  test("round-trips the versioned format", () => {
    const data = {
      notes: [{ id: "a", title: "T", content: "C", pinned: true, createdAt: 1, updatedAt: 2 }],
      activeId: "a",
    };
    expect(deserialize(serialize(data))).toEqual(data);
  });

  test("drops invalid entries and duplicate ids", () => {
    const raw = JSON.stringify({
      version: 1,
      notes: [null, 42, { title: "no id" }, { id: "a" }, { id: "a", title: "dup" }],
      activeId: 7,
    });
    const result = deserialize(raw);
    expect(result?.notes.map((n) => n.id)).toEqual(["a"]);
    expect(result?.activeId).toBeNull();
  });
});

test.describe("parseNote", () => {
  test("fills safe defaults for wrongly typed fields", () => {
    expect(parseNote({ id: "a", title: 1, content: null, createdAt: 5 })).toEqual({
      id: "a",
      title: "Untitled",
      content: "",
      pinned: false,
      createdAt: 5,
      updatedAt: 5,
    });
  });
});
