import { test, expect, type Page } from "@playwright/test";
import { createNote, editor, gotoFresh, noteRow, titleInput } from "./helpers";

const library = (page: Page) => page.getByRole("navigation", { name: "Library" });
const openTrash = (page: Page) => library(page).getByRole("button", { name: /^Trash/ }).click();
const openAll = (page: Page) => library(page).getByRole("button", { name: /^All notes/ }).click();

async function noteTitled(page: Page, title: string, body = "") {
  await createNote(page);
  await titleInput(page).fill(title);
  if (body) await editor(page).fill(body);
}

async function trash(page: Page, title: string) {
  await noteRow(page, title).hover();
  await noteRow(page, title).getByRole("button", { name: "Delete note" }).click();
}

test.describe("Trash", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("deleted notes wait in the trash and can be restored", async ({ page }) => {
    await noteTitled(page, "Draft", "# Keep this");
    await noteTitled(page, "Other");
    await trash(page, "Draft");
    await expect(noteRow(page, "Draft")).toBeHidden();
    await expect(library(page).getByRole("button", { name: /^Trash/ })).toContainText("1");

    await openTrash(page);
    await expect(noteRow(page, "Draft")).toContainText(/deleted just now · 30 days left/);
    await noteRow(page, "Draft").click();

    // A trashed note opens read-only, with a way back.
    const pane = page.getByRole("region", { name: "Note in trash" });
    await expect(pane).toContainText("This note is in the trash");
    await expect(pane.locator("h1")).toHaveText("Keep this");
    await expect(editor(page)).toBeHidden();
    await pane.getByRole("button", { name: "Restore" }).click();

    await expect(page.getByRole("status")).toContainText("Restored “Draft”");
    await openAll(page);
    await expect(noteRow(page, "Draft")).toBeVisible();
    await expect(titleInput(page)).toHaveValue("Draft");
  });

  test("notes can be deleted forever, one by one or by emptying the trash", async ({ page }) => {
    for (const t of ["One", "Two", "Three"]) await noteTitled(page, t);
    for (const t of ["One", "Two", "Three"]) await trash(page, t);

    await openTrash(page);
    await noteRow(page, "One").hover();
    await noteRow(page, "One").getByRole("button", { name: "Delete forever" }).click();
    await expect(page.getByRole("status")).toContainText("Deleted “One” forever");
    await expect(noteRow(page, "One")).toBeHidden();

    // Emptying needs a second click.
    const empty = page.getByRole("button", { name: "Empty trash" });
    await empty.click();
    await page.getByRole("button", { name: "Click again to empty" }).click();
    await expect(page.getByText("The trash is empty.")).toBeVisible();

    await page.reload();
    await openTrash(page);
    await expect(page.getByText("The trash is empty.")).toBeVisible();
  });

  test("leaving the trash does not keep a trashed note open", async ({ page }) => {
    await noteTitled(page, "Live");
    await noteTitled(page, "Gone");
    await trash(page, "Gone");
    await openTrash(page);
    await noteRow(page, "Gone").click();
    await openAll(page);
    await expect(titleInput(page)).toHaveValue("Live");
  });
});
