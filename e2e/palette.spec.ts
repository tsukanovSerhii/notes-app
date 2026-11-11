import { test, expect } from "@playwright/test";
import { createNote, editor, gotoFresh, titleInput } from "./helpers";

test("the command palette jumps to notes and runs commands from the keyboard", async ({ page }) => {
  await gotoFresh(page);
  for (const title of ["Groceries", "Meeting notes", "Ideas"]) {
    await createNote(page);
    await titleInput(page).fill(title);
  }

  // Works from inside the editor too.
  await editor(page).click();
  await page.keyboard.press("Control+Shift+P");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await page.keyboard.type("mtng");
  await expect(palette.getByRole("option").first()).toHaveText("Meeting notes");
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(titleInput(page)).toHaveValue("Meeting notes");

  // Ctrl+K outside the editor; commands are found by name.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+K");
  await page.keyboard.type("light theme");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.keyboard.press("Control+Shift+P");
  await page.keyboard.type("new note");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(titleInput(page)).toHaveValue("Untitled");
});
