import { expect, test } from "@playwright/test";
import { fillTemplate, templatesFolder, userTemplates } from "@/features/editor/lib/userTemplates";
import { folder, note } from "@/features/notes/testing";

const folders = [folder("t", { name: " templates " }), folder("x", { name: "Templates", parentId: "t" })];

test("the Templates folder is found by name at the top level, ignoring case and spaces", () => {
  expect(templatesFolder(folders)?.id).toBe("t");
  expect(templatesFolder([folder("n", { name: "Nested", parentId: "t" })])).toBeNull();
  expect(templatesFolder([])).toBeNull();
});

test("live notes in that folder become templates, sorted by title", () => {
  const list = userTemplates(
    [
      note("1", { title: "Retro", content: "# Retro", folderId: "t" }),
      note("2", { title: "Agenda", content: "# Agenda", folderId: "t" }),
      note("3", { title: "Elsewhere", folderId: null }),
      note("4", { title: "Deleted", folderId: "t", trashedAt: 5 }),
    ],
    folders
  );
  expect(list.map((t) => t.label)).toEqual(["Agenda", "Retro"]);
  expect(list[0].custom).toBe(true);
  expect(list[0].body()).toBe("# Agenda");
  expect(userTemplates([note("1", { folderId: "t" })], [])).toEqual([]);
});

test("date and time placeholders are filled in", () => {
  const now = new Date(2025, 0, 9, 7, 5);
  expect(fillTemplate("# {{date}} at {{ time }} {{DATE}} {{other}}", now)).toBe("# 2025-01-09 at 07:05 2025-01-09 {{other}}");
});
