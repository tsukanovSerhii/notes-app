import { test, expect, type Page } from "@playwright/test";
import { createNote, gotoFresh, noteRow, titleInput } from "./helpers";

async function noteWithTags(page: Page, title: string, tags: string[]) {
  await createNote(page);
  await titleInput(page).fill(title);
  const input = page.getByRole("combobox", { name: "Add tag" });
  for (const tag of tags) {
    await input.fill(tag);
    await input.press("Enter");
  }
}

const filter = (page: Page) => page.getByRole("group", { name: "Filter by tag" });

test("a tag can be renamed, merged into another and deleted in all notes", async ({ page }) => {
  await gotoFresh(page);
  await noteWithTags(page, "One", ["idea", "work"]);
  await noteWithTags(page, "Two", ["idea"]);
  await noteWithTags(page, "Three", ["plan"]);

  await page.getByRole("button", { name: "Manage tags" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Manage tags" });
  await expect(dialog).toContainText("#idea");

  // Rename: both notes follow.
  await dialog.getByRole("button", { name: "Rename #idea" }).click();
  await dialog.getByLabel("New name for #idea").fill("thought");
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Renamed #idea to #thought in 2 notes");
  await expect(dialog).toContainText("#thought");
  await expect(dialog).not.toContainText("#idea");

  // Merge into an existing tag.
  await dialog.getByRole("button", { name: "Rename #thought" }).click();
  await dialog.getByLabel("New name for #thought").fill("work");
  await expect(dialog).toContainText("#work already exists");
  await dialog.getByRole("button", { name: "Merge" }).click();
  await expect(page.getByRole("status")).toContainText("Merged #thought into #work in 2 notes");

  // Delete needs a second click.
  await dialog.getByRole("button", { name: "Delete #plan" }).click();
  await dialog.getByRole("button", { name: "Remove #plan from all notes" }).click();
  await expect(page.getByRole("status")).toContainText("Removed #plan from 1 note");
  await page.keyboard.press("Escape");

  await expect(filter(page).getByRole("button")).toHaveText([/#work 2/]);
  await filter(page).getByRole("button", { name: /#work/ }).click();
  await expect(noteRow(page, "One")).toBeVisible();
  await expect(noteRow(page, "Two")).toBeVisible();
  await expect(noteRow(page, "Three")).toBeHidden();
});
