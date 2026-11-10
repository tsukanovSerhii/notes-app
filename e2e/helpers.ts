import { type Page, expect } from "@playwright/test";

export const editor = (page: Page) =>
  page.locator('textarea[placeholder="Start writing in Markdown..."]');

export const titleInput = (page: Page) => page.locator('input[placeholder="Untitled"]');

export const preview = (page: Page) => page.locator("#preview-content");

export const emptyState = (page: Page) =>
  page.getByRole("heading", { name: "No notes yet" });

export const noteList = (page: Page) => page.getByRole("list", { name: "Note list" });

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The row of the note whose title starts with `title` ("Tagged" ≠ "Untagged"). */
export const noteRow = (page: Page, title: string) =>
  noteList(page)
    .locator("li", { hasText: new RegExp(`^${escapeRegExp(title)}`) })
    .first();

/**
 * Every test gets a fresh browser context, so the first load is a first visit
 * and seeds the welcome note. This empties IndexedDB (keeping the database
 * initialized, so the app does not seed again) and reloads.
 */
export async function gotoFresh(page: Page) {
  await page.goto("/");
  await expect(titleInput(page)).toHaveValue("Welcome to NoteVoid");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("notevoid");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // Wait until the app has written the seeded state.
    for (let i = 0; i < 50; i++) {
      const has = await new Promise((resolve) => {
        const req = db.transaction("meta").objectStore("meta").get("state");
        req.onsuccess = () => resolve(req.result !== undefined);
      });
      if (has) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const tx = db.transaction(["notes", "meta"], "readwrite");
    tx.objectStore("notes").clear();
    tx.objectStore("meta").put({ folders: [], tombstones: {}, activeId: null }, "state");
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
    localStorage.clear();
  });
  await page.reload();
  await expect(emptyState(page)).toBeVisible();
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

/** Reads every note stored in IndexedDB. */
export function storedNotes(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ id: string; title: string }[]>((resolve, reject) => {
        const req = indexedDB.open("notevoid");
        req.onsuccess = () => {
          const get = req.result.transaction("notes").objectStore("notes").getAll();
          get.onsuccess = () => {
            req.result.close();
            resolve(get.result);
          };
        };
        req.onerror = () => reject(req.error);
      })
  );
}
