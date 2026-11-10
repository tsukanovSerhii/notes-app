import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  createNote,
  editor,
  titleInput,
  preview,
  noteRow,
  storedNotes,
} from "./helpers";

test.describe("Folders, tags, highlighting & storage", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("folders group notes and deleting a folder keeps its notes", async ({ page }) => {
    await createNote(page);
    await titleInput(page).fill("Loose note");

    const library = page.getByRole("navigation", { name: "Library" });
    await library.getByRole("button", { name: "New folder" }).click();
    await page.getByRole("textbox", { name: "New folder name" }).fill("Work");
    await page.keyboard.press("Enter");

    // The new folder is selected, so a new note lands in it.
    await createNote(page);
    await titleInput(page).fill("Roadmap");
    await expect(page.getByRole("combobox", { name: "Folder" })).toHaveValue(/.+/);
    await expect(noteRow(page, "Roadmap")).toBeVisible();
    await expect(noteRow(page, "Loose note")).toBeHidden();

    await library.getByRole("button", { name: /^All notes/ }).click();
    await expect(noteRow(page, "Loose note")).toBeVisible();

    await library.getByRole("button", { name: /^Work/ }).hover();
    await library.getByRole("button", { name: "Delete folder Work" }).click();
    await expect(library.getByRole("button", { name: /^Work/ })).toBeHidden();
    await expect(noteRow(page, "Roadmap")).toBeVisible();
  });

  test("tags can be added, removed and used as a filter", async ({ page }) => {
    await createNote(page);
    await titleInput(page).fill("Tagged");
    const tagInput = page.getByRole("combobox", { name: "Add tag" });
    await tagInput.fill("Work");
    await tagInput.press("Enter");
    await tagInput.fill("idea");
    await tagInput.press("Enter");
    await expect(page.getByRole("list", { name: "Tags" })).toContainText("#work");

    await createNote(page);
    await titleInput(page).fill("Untagged");

    const tagFilter = page.getByRole("group", { name: "Filter by tag" });
    await tagFilter.getByRole("button", { name: /#work/ }).click();
    await expect(noteRow(page, "Tagged")).toBeVisible();
    await expect(noteRow(page, "Untagged")).toBeHidden();

    await tagFilter.getByRole("button", { name: /#work/ }).click();
    await expect(noteRow(page, "Untagged")).toBeVisible();

    await noteRow(page, "Tagged").click();
    await page.getByRole("button", { name: "Remove tag idea" }).click();
    await expect(page.getByRole("list", { name: "Tags" })).not.toContainText("#idea");
  });

  test("code blocks are syntax highlighted with a language label", async ({ page }) => {
    await createNote(page);
    await editor(page).fill("```ts\nconst answer: number = 42; // yes\n```");
    const code = preview(page).locator("pre code");
    await expect(code.locator(".tok-keyword")).toHaveText("const");
    await expect(code.locator(".tok-number")).toHaveText("42");
    await expect(code.locator(".tok-comment")).toHaveText("// yes");
    await expect(preview(page).getByText("ts", { exact: true })).toBeVisible();
  });

  test("notes are stored per record in IndexedDB", async ({ page }) => {
    await createNote(page);
    await titleInput(page).fill("In the database");
    await expect.poll(async () => (await storedNotes(page)).map((n) => n.title)).toEqual([
      "In the database",
    ]);
  });
});

test("migrates notes from the old localStorage format", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(
      "notevoid-notes",
      JSON.stringify({
        version: 1,
        notes: [{ id: "old", title: "Legacy note", content: "from v1", pinned: false, createdAt: 1, updatedAt: 1 }],
        activeId: "old",
      })
    );
  });
  await page.goto("/");
  await expect(titleInput(page)).toHaveValue("Legacy note");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("notevoid-notes"))).toBeNull();

  await page.reload();
  await expect(titleInput(page)).toHaveValue("Legacy note");
});
