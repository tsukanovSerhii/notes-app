import { test, expect, type Page } from "@playwright/test";
import { createNote, gotoFresh, noteRow, titleInput } from "./helpers";

const library = (page: Page) => page.getByRole("navigation", { name: "Library" });
const row = (page: Page, name: string) => library(page).getByRole("button", { name: new RegExp(`^${name}( \\d+)?$`) });

async function newFolder(page: Page, name: string, inside?: string) {
  if (inside) {
    await row(page, inside).hover();
    await page.getByRole("button", { name: `New folder in ${inside}` }).click();
  } else {
    await library(page).getByRole("button", { name: "New folder", exact: true }).click();
  }
  await page.getByLabel(inside ? `New folder in ${inside}` : "New folder name").last().fill(name);
  await page.keyboard.press("Enter");
}

test("folders nest, filters and counts include subfolders, and deleting lifts the contents", async ({ page }) => {
  await gotoFresh(page);
  await newFolder(page, "Work");
  await newFolder(page, "Web", "Work");
  await newFolder(page, "Home");

  // Web is drawn inside Work.
  const indent = async (name: string) => (await row(page, name).evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft)));
  expect(await indent("Web")).toBeGreaterThan(await indent("Work"));

  await library(page).getByRole("button", { name: /^All notes/ }).click();
  await createNote(page);
  await titleInput(page).fill("Site plan");
  await page.getByRole("combobox", { name: "Folder" }).selectOption({ label: "Work / Web" });

  // The parent counts and shows the note too.
  await expect(row(page, "Web")).toContainText("1");
  await expect(row(page, "Work")).toContainText("1");
  await expect(row(page, "Home")).toContainText("0");
  await row(page, "Work").click();
  await expect(noteRow(page, "Site plan")).toBeVisible();

  // Drag the Web folder to Home: the note follows it.
  await row(page, "Web").dragTo(row(page, "Home"));
  await expect(page.getByRole("status")).toContainText("Moved folder “Web” to Home");
  await expect(row(page, "Work")).toContainText("0");
  await expect(row(page, "Home")).toContainText("1");

  // Deleting Home keeps Web and the note, one level up (the top).
  await row(page, "Home").hover();
  await page.getByRole("button", { name: "Delete folder Home" }).click();
  await expect(row(page, "Web")).toBeVisible();
  await expect(row(page, "Web")).toContainText("1");
  await row(page, "Web").click();
  await expect(noteRow(page, "Site plan")).toBeVisible();
  expect(await indent("Web")).toBe(await indent("Work"));
});

test("a folder cannot be dropped into its own subfolder", async ({ page }) => {
  await gotoFresh(page);
  await newFolder(page, "Outer");
  await newFolder(page, "Inner", "Outer");
  await row(page, "Outer").dragTo(row(page, "Inner"));
  // Nothing moved: Inner is still the deeper row.
  const indent = async (name: string) => (await row(page, name).evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft)));
  expect(await indent("Inner")).toBeGreaterThan(await indent("Outer"));
  await expect(page.getByRole("status")).toBeHidden();
});
