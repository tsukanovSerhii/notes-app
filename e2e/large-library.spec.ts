import { test, expect, type Page } from "@playwright/test";
import { emptyState, gotoFresh, noteList, titleInput } from "./helpers";

/** Replaces the library with `count` notes, written straight into IndexedDB. */
async function seed(page: Page, count: number) {
  await page.evaluate(async (count) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("notevoid");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["notes", "meta"], "readwrite");
      const store = tx.objectStore("notes");
      store.clear();
      for (let i = 0; i < count; i++) {
        const t = 1_700_000_000_000 + i * 60_000;
        store.put({
          id: `n${i}`,
          title: `Note ${i}`,
          content: `# Note ${i}\n\nBody of note ${i}, with some words to read. See [[Note ${(i + 1) % count}]].`,
          pinned: false,
          tags: [i % 2 ? "odd" : "even"],
          folderId: null,
          createdAt: t,
          updatedAt: t,
          editedAt: t,
          editedBy: null,
          trashedAt: null,
          conflictOf: null,
        });
      }
      tx.objectStore("meta").put({ folders: [], tombstones: {}, activeId: `n${count - 1}` }, "state");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, count);
  await page.reload();
}

test("a library of hundreds of notes draws only the rows that are on screen, and every note stays reachable", async ({
  page,
}) => {
  await gotoFresh(page);
  await seed(page, 600);
  await expect(titleInput(page)).toHaveValue("Note 599");

  // The heading counts all of them; the page does not hold a row for each.
  await expect(page.getByRole("heading", { name: /All notes/ })).toContainText("600");
  const rows = await noteList(page).locator("li").count();
  expect(rows).toBeGreaterThan(0);
  expect(rows).toBeLessThan(80);
  expect(await page.evaluate(() => document.querySelectorAll("*").length)).toBeLessThan(2500);

  // Scrolling to the end brings the oldest note into view, and it opens.
  await page.locator("aside .overflow-y-auto").evaluate((el) => (el.scrollTop = el.scrollHeight));
  const oldest = noteList(page).getByRole("button", { name: /^Note 0\b/ });
  await expect(oldest).toBeVisible();
  await oldest.click();
  await expect(titleInput(page)).toHaveValue("Note 0");
  // Rows far from the window were removed again.
  expect(await noteList(page).locator("li").count()).toBeLessThan(80);
});

test("searching a large library finds a note that was never drawn", async ({ page }) => {
  await gotoFresh(page);
  await seed(page, 600);
  await expect(titleInput(page)).toHaveValue("Note 599");
  await page.getByRole("searchbox").fill("Body of note 123");
  const hit = noteList(page).getByRole("button", { name: /Note 123\b/ }).first();
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(titleInput(page)).toHaveValue("Note 123");
});

test("an empty library still shows its empty state", async ({ page }) => {
  await gotoFresh(page);
  await expect(emptyState(page)).toBeVisible();
});
