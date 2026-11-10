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
    await page.getByRole("menuitem", { name: /To-do list/i }).click();

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

  test("native undo works after a toolbar action", async ({ page }) => {
    await editor(page).fill("text");
    await selectRange(page, 0, 4);
    await page.getByRole("button", { name: /^Bold/i }).click();
    await expect(editor(page)).toHaveValue("**text**");

    await editor(page).press("Control+z");
    await expect(editor(page)).toHaveValue("text");
  });

  test("Enter continues a list and ends it on an empty item", async ({
    page,
  }) => {
    await editor(page).click();
    await page.keyboard.type("- milk");
    await page.keyboard.press("Enter");
    await page.keyboard.type("eggs");
    await expect(editor(page)).toHaveValue("- milk\n- eggs");

    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(editor(page)).toHaveValue("- milk\n- eggs\n");
  });

  test("view mode switches between edit, split and preview", async ({
    page,
  }) => {
    const modes = page.getByRole("group", { name: "View mode" });

    await modes.getByRole("button", { name: "Preview" }).click();
    await expect(editor(page)).toBeHidden();
    await expect(preview(page)).toBeVisible();

    await modes.getByRole("button", { name: "Edit" }).click();
    await expect(editor(page)).toBeVisible();
    await expect(preview(page)).toBeHidden();

    await modes.getByRole("button", { name: "Split" }).click();
    await expect(editor(page)).toBeVisible();
    await expect(preview(page)).toBeVisible();
  });

  test("external links in the preview open in a new tab", async ({ page }) => {
    await editor(page).fill("[site](https://example.com)");
    const link = preview(page).getByRole("link", { name: "site" });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

test.describe("Mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("notes list lives in a drawer", async ({ page }) => {
    await gotoFresh(page);
    await createNote(page);
    await titleInput(page).fill("Phone note");

    await page.getByRole("button", { name: "Open notes list" }).click();
    await expect(page.locator("aside").getByText("Phone note")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("aside").getByText("Phone note")).toBeHidden();
  });
});
