import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  createNote,
  editor,
  titleInput,
  preview,
  selectRange,
} from "./helpers";

test.describe("Editor toolbar, shortcuts, templates & cheatsheet", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
    await createNote(page);
  });

  test("toolbar Bold wraps the selection", async ({ page }) => {
    await editor(page).fill("hello world");
    await selectRange(page, 6, 11);
    await page.getByRole("button", { name: /^Bold/i }).click();
    await expect(editor(page)).toHaveValue("hello **world**");
  });

  test("toolbar Bullet list prefixes selected lines", async ({ page }) => {
    await editor(page).fill("a\nb\nc");
    await selectRange(page, 0, 5);
    await page.getByRole("button", { name: /Bullet list/i }).click();
    await expect(editor(page)).toHaveValue("- a\n- b\n- c");
  });

  test("toolbar Table inserts a GFM table rendered in preview", async ({
    page,
  }) => {
    await editor(page).click();
    await page.getByRole("button", { name: /^Table$/i }).click();
    await expect(editor(page)).toHaveValue(/\| Column A \|/);
    await expect(preview(page).locator("table")).toHaveCount(1);
  });

  test("keyboard shortcuts Ctrl+B / Ctrl+I / Ctrl+K", async ({ page }) => {
    await editor(page).fill("text");
    await selectRange(page, 0, 4);
    await editor(page).press("Control+b");
    await expect(editor(page)).toHaveValue("**text**");

    await editor(page).fill("text");
    await selectRange(page, 0, 4);
    await editor(page).press("Control+i");
    await expect(editor(page)).toHaveValue("*text*");

    await editor(page).fill("text");
    await selectRange(page, 0, 4);
    await editor(page).press("Control+k");
    await expect(editor(page)).toHaveValue("[text](url)");
  });

  test("Templates menu inserts a whole note and adopts the title", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Templates/i }).click();
    await page.getByRole("button", { name: /To-do list/i }).click();

    await expect(titleInput(page)).toHaveValue("To-do list");
    await expect(editor(page)).toHaveValue(/## Today/);

    await expect(
      preview(page).locator('input[type="checkbox"]')
    ).toHaveCount(3);
  });

  test("Markdown cheatsheet opens and closes", async ({ page }) => {
    await page.getByRole("button", { name: /Markdown help/i }).click();
    await expect(page.getByText(/Markdown cheatsheet/i)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByText(/Markdown cheatsheet/i)).toBeHidden();
  });
});
