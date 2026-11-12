import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { createNote, editor, gotoFresh, titleInput } from "./helpers";

test("all notes download as a ZIP of Markdown files in folders", async ({ page }) => {
  await gotoFresh(page);
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  await page.getByLabel("New folder name").fill("Work");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /^All notes/ }).click();

  await createNote(page);
  await titleInput(page).fill("Plan");
  await editor(page).fill("# Plan\n\nship it");
  await page.getByRole("combobox", { name: "Folder" }).selectOption({ label: "Work" });
  await createNote(page);
  await titleInput(page).fill("Loose");
  await editor(page).fill("top level");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: /Export all notes/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^notevoid-notes-\d{4}-\d{2}-\d{2}\.zip$/);
  await expect(page.getByRole("status")).toContainText("Exported 2 notes");

  // Stored entries: names and text are readable straight from the bytes.
  const bytes = readFileSync((await file.path())!);
  expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
  const text = bytes.toString("latin1");
  expect(text).toContain("Work/Plan.md");
  expect(text).toContain("Loose.md");
  expect(text).toContain("ship it");
});
