import { type Page, expect } from "@playwright/test";

export const editor = (page: Page) =>
  page.locator('textarea[placeholder="Start writing in Markdown..."]');

export const titleInput = (page: Page) =>
  page.locator('input[placeholder="Untitled"]');

export const preview = (page: Page) => page.locator("#preview-content");

export async function gotoFresh(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(
    page.getByText(/Select a note or create a new one/i)
  ).toBeVisible();
}

export async function createNote(page: Page) {
  await page.getByRole("button", { name: /New note/i }).first().click();
  await expect(editor(page)).toBeVisible();
}

export async function selectRange(page: Page, start: number, end: number) {
  await page.evaluate(
    ([s, e]) => {
      const ta = document.querySelector("textarea")!;
      ta.focus();
      ta.setSelectionRange(s, e);
    },
    [start, end]
  );
}
