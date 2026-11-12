import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { createNote, editor, gotoFresh } from "./helpers";

test("? opens the shortcut list, Escape closes it, and typing ? in a note does not", async ({ page }) => {
  await gotoFresh(page);
  await page.locator("body").press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Command palette");
  await expect(dialog).toContainText("Show keyboard shortcuts");
  const { violations } = await new AxeBuilder({ page }).include("dialog[open]").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await createNote(page);
  await editor(page).pressSequentially("what?");
  await expect(editor(page)).toHaveValue("what?");
  await expect(dialog).toBeHidden();
});

test("the shortcut list is also in the menu and the palette", async ({ page }) => {
  await gotoFresh(page);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+Shift+P");
  await page.getByPlaceholder(/Search notes or type a command/).fill("shortcuts");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
});
