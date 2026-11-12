import { test, expect } from "@playwright/test";
import { editor, gotoFresh, noteList, titleInput } from "./helpers";

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("Today opens one note per day, made the first time, with the daily tag", async ({ page }) => {
  await gotoFresh(page);
  const iso = isoToday();

  await page.getByRole("navigation", { name: "Library" }).getByRole("button", { name: "Today" }).click();
  await expect(titleInput(page)).toHaveValue(iso);
  await expect(editor(page)).toHaveValue(`# ${iso}\n\n`);
  await expect(page.getByRole("navigation", { name: "Library" })).toContainText("#daily");

  // Pressing it again, from another note, goes back to the same note.
  await editor(page).fill(`# ${iso}\n\nwrote something`);
  await page.getByRole("button", { name: /New note/i }).first().click();
  await expect(titleInput(page)).toHaveValue("Untitled");
  await page.keyboard.press("Alt+D");
  await expect(titleInput(page)).toHaveValue(iso);
  await expect(editor(page)).toHaveValue(`# ${iso}\n\nwrote something`);
  await expect(noteList(page).locator("li").filter({ hasText: iso })).toHaveCount(1);
});

test("Today is in the command palette", async ({ page }) => {
  await gotoFresh(page);
  await page.keyboard.press("Control+Shift+P");
  await page.getByPlaceholder(/Search notes or type a command/).fill("today");
  await page.keyboard.press("Enter");
  await expect(titleInput(page)).toHaveValue(isoToday());
});
