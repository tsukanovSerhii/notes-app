import { expect, test } from "@playwright/test";
import { canMoveFolder, folderNoteCounts, folderPath, folderRows, folderWithDescendants } from "@/features/notes/model/folders";
import { folder } from "@/features/notes/testing";

const tree = [
  folder("work", { name: "Work" }),
  folder("web", { name: "Web", parentId: "work" }),
  folder("api", { name: "API", parentId: "web" }),
  folder("docs", { name: "Docs", parentId: "work" }),
  folder("home", { name: "Home" }),
];

test("folderRows lists the tree depth-first with siblings by name", () => {
  expect(folderRows(tree).map((r) => [r.folder.id, r.depth])).toEqual([
    ["home", 0],
    ["work", 0],
    ["docs", 1],
    ["web", 1],
    ["api", 2],
  ]);
});

test("a missing parent or a cycle makes the folder top level instead of losing it", () => {
  const orphan = folder("o", { name: "Orphan", parentId: "gone" });
  const loopA = folder("a", { name: "A", parentId: "b" });
  const loopB = folder("b", { name: "B", parentId: "a" });
  const self = folder("s", { name: "Self", parentId: "s" });
  const rows = folderRows([orphan, loopA, loopB, self]);
  expect(rows.map((r) => r.folder.id).sort()).toEqual(["a", "b", "o", "s"]);
  expect(rows.every((r) => r.depth === 0)).toBe(true);
});

test("folderWithDescendants includes the whole subtree", () => {
  expect([...folderWithDescendants(tree, "work")].sort()).toEqual(["api", "docs", "web", "work"]);
  expect([...folderWithDescendants(tree, "api")]).toEqual(["api"]);
  expect([...folderWithDescendants(tree, "home")]).toEqual(["home"]);
});

test("folderPath names where a folder sits", () => {
  expect(folderPath(tree, "api")).toBe("Work / Web / API");
  expect(folderPath(tree, "home")).toBe("Home");
  expect(folderPath(tree, "nope")).toBe("");
});

test("canMoveFolder refuses moves into itself or its own subtree", () => {
  expect(canMoveFolder(tree, "web", "home")).toBe(true);
  expect(canMoveFolder(tree, "web", null)).toBe(true);
  expect(canMoveFolder(tree, "work", "api")).toBe(false);
  expect(canMoveFolder(tree, "work", "work")).toBe(false);
  expect(canMoveFolder(tree, "web", "missing")).toBe(false);
});

test("folderNoteCounts counts subfolders in their parents, in one pass", () => {
  const folders = [
    folder("a", { name: "A" }),
    folder("b", { name: "B", parentId: "a" }),
    folder("c", { name: "C", parentId: "b" }),
    folder("d", { name: "D" }),
  ];
  const notes = [
    { folderId: "c" },
    { folderId: "c" },
    { folderId: "b" },
    { folderId: "a" },
    { folderId: "d" },
    { folderId: null },
    { folderId: "gone" },
  ];
  expect([...folderNoteCounts(folders, notes)]).toEqual([
    ["a", 4],
    ["b", 3],
    ["c", 2],
    ["d", 1],
  ]);
});

test("folderNoteCounts is not fooled by a cycle or a missing parent", () => {
  const folders = [
    folder("x", { name: "X", parentId: "y" }),
    folder("y", { name: "Y", parentId: "x" }),
    folder("z", { name: "Z", parentId: "gone" }),
  ];
  const counts = folderNoteCounts(folders, [{ folderId: "x" }, { folderId: "z" }]);
  // Both ends of a cycle are shown as top-level folders, each with its own notes.
  expect(counts.get("x")).toBe(1);
  expect(counts.get("y")).toBe(0);
  expect(counts.get("z")).toBe(1);
});
