import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  createNote,
  editor,
  titleInput,
  preview,
  emptyState,
  noteRow,
  expectEditorValue,
} from "./helpers";

test.describe("Notes CRUD, search & persistence", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("creates a note and edits title + content", async ({ page }) => {
    await createNote(page);

    await titleInput(page).fill("My first note");
    await editor(page).fill("Hello there");

    await expect(
      page.locator("aside").getByText("My first note")
    ).toBeVisible();

    await expect(page.getByText(/11 chars/)).toBeVisible();
  });

  test("renders live markdown preview (GFM)", async ({ page }) => {
    await createNote(page);
    await editor(page).fill(
      [
        "# Heading",
        "",
        "**bold** and *italic*",
        "",
        "- a",
        "- b",
        "",
        "| X | Y |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "- [x] done",
        "- [ ] todo",
      ].join("\n")
    );

    await expect(preview(page).locator("h1")).toHaveText("Heading");
    await expect(preview(page).locator("strong")).toHaveText("bold");
    await expect(preview(page).locator("li")).toHaveCount(4);
    await expect(preview(page).locator("table td")).toHaveCount(2);
    await expect(
      preview(page).locator('input[type="checkbox"]')
    ).toHaveCount(2);
    await expect(
      preview(page).locator('input[type="checkbox"]:checked')
    ).toHaveCount(1);
  });

  test("searches by title and by content", async ({ page }) => {
    await createNote(page);
    await titleInput(page).fill("Groceries");
    await editor(page).fill("milk and eggs");

    await createNote(page);
    await titleInput(page).fill("Work plan");
    await editor(page).fill("ship the feature");

    const search = page.locator('input[placeholder="Search notes..."]');

    await search.fill("Grocer");
    await expect(page.locator("aside").getByText("Groceries")).toBeVisible();
    await expect(page.locator("aside").getByText("Work plan")).toBeHidden();

    await search.fill("ship");
    await expect(page.locator("aside").getByText("Work plan")).toBeVisible();
    await expect(page.locator("aside").getByText("Groceries")).toBeHidden();

    await search.fill("");
    await expect(page.locator("aside").getByText("Groceries")).toBeVisible();
    await expect(page.locator("aside").getByText("Work plan")).toBeVisible();
  });

  test("persists notes across reload", async ({ page }) => {
    await createNote(page);
    await titleInput(page).fill("Persist me");
    await editor(page).fill("still here");

    await page.reload();

    await expect(page.locator("aside").getByText("Persist me")).toBeVisible();
    await expectEditorValue(editor(page), "still here");
  });

  test("deletes a note and falls back gracefully", async ({ page }) => {
    await createNote(page);
    await titleInput(page).fill("Alpha");
    await createNote(page);
    await titleInput(page).fill("Beta");

    const betaRow = noteRow(page, "Beta");
    await betaRow.hover();
    await betaRow.getByRole("button", { name: /Delete note/i }).click();

    await expect(page.locator("aside").getByText("Beta")).toBeHidden();
    await expect(titleInput(page)).toHaveValue("Alpha");

    const alphaRow = noteRow(page, "Alpha");
    await alphaRow.hover();
    await alphaRow.getByRole("button", { name: /Delete note/i }).click();

    await expect(emptyState(page)).toBeVisible();
  });

  test("undoes a delete from the toast", async ({ page }) => {
    await createNote(page);
    await titleInput(page).fill("Keep me");

    await noteRow(page, "Keep me").hover();
    await noteRow(page, "Keep me")
      .getByRole("button", { name: /Delete note/i })
      .click();
    await expect(page.getByRole("status")).toContainText("Moved “Keep me” to the trash");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(noteRow(page, "Keep me")).toBeVisible();
    await expect(titleInput(page)).toHaveValue("Keep me");
  });

  test("pinned notes stay on top", async ({ page }) => {
    await createNote(page);
    await titleInput(page).fill("Older");
    await createNote(page);
    await titleInput(page).fill("Newer");

    const rows = page.getByRole("list", { name: "Note list" }).locator("li");
    await expect(rows.first()).toContainText("Newer");

    await noteRow(page, "Older").hover();
    await noteRow(page, "Older").getByRole("button", { name: "Pin note" }).click();
    await expect(rows.first()).toContainText("Older");
  });

  test("first visit opens a pinned welcome note", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await page.goto("/");
    await expect(titleInput(page)).toHaveValue("Welcome to NoteVoid");
    await expect(preview(page).locator("h1")).toHaveText("Welcome to NoteVoid");
  });

  test("Alt+N creates a note and / focuses search", async ({ page }) => {
    await page.keyboard.press("Alt+n");
    await expect(titleInput(page)).toBeFocused();

    await titleInput(page).blur();
    await page.keyboard.press("/");
    await expect(
      page.getByRole("searchbox", { name: "Search notes" })
    ).toBeFocused();
  });

  test("syncs notes between tabs", async ({ page, context }) => {
    await createNote(page);
    await titleInput(page).fill("Shared");

    const second = await context.newPage();
    await second.goto("/");
    await expect(noteRow(second, "Shared")).toBeVisible();

    await createNote(second);
    await titleInput(second).fill("From tab two");

    await expect(noteRow(page, "From tab two")).toBeVisible();
  });
});
