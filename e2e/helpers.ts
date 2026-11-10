import { type Page, expect } from "@playwright/test";

export const editor = (page: Page) =>
  page.locator('textarea[placeholder="Start writing in Markdown..."]');

export const titleInput = (page: Page) =>
  page.locator('input[placeholder="Untitled"]');

export const preview = (page: Page) => page.locator("#preview-content");

export const emptyState = (page: Page) =>
  page.getByRole("heading", { name: "No notes yet" });

/** Opens the app with no notes at all (skips the first-visit welcome note). */
export async function gotoFresh(page: Page) {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "notevoid-notes",
      JSON.stringify({ version: 1, notes: [], activeId: null })
    )
  );
  await page.reload();
  await expect(emptyState(page)).toBeVisible();
}

/** Opens the app as a brand-new visitor. */
export async function gotoFirstVisit(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

export const noteRow = (page: Page, title: string) =>
  page.locator("aside li", { hasText: title }).first();

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
