import { type Locator, type Page, expect } from "@playwright/test";

/** The editor (CodeMirror). Type into it with fill, press and pressSequentially. */
export const editor = (page: Page) => page.locator('[data-testid="editor"] .cm-content');

/** The text of the editor, line by line, without the placeholder. */
export const editorText = (locator: Locator) =>
  locator.evaluate((el) =>
    [...el.querySelectorAll(".cm-line")]
      .map((line) => {
        const copy = line.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(".cm-placeholder").forEach((p) => p.remove());
        return copy.textContent ?? "";
      })
      .join("\n")
  );

/** Waits until the editor holds exactly this text (a string) or matches it (a regular expression). */
export async function expectEditorValue(locator: Locator, expected: string | RegExp) {
  await expect
    .poll(async () => {
      const text = await editorText(locator);
      return typeof expected === "string" ? text === expected : expected.test(text);
    }, { message: `editor text should match ${String(expected)}` })
    .toBe(true);
}

/** The line the caret is on. */
export const caretLine = (page: Page) =>
  page.evaluate(() => getSelection()?.anchorNode?.parentElement?.closest(".cm-line")?.textContent ?? null);

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

/** Selects characters `start`..`end` of the editor text (offsets count a newline as one). */
export async function selectRange(page: Page, start: number, end: number) {
  await page.evaluate(
    ([s, e]) => {
      const content = document.querySelector<HTMLElement>('[data-testid="editor"] .cm-content')!;
      content.focus();
      const lines = [...content.querySelectorAll(".cm-line")];
      const locate = (offset: number): [Node, number] => {
        let rest = offset;
        for (const line of lines) {
          const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
          const nodes: Text[] = [];
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!(n.parentElement?.closest(".cm-placeholder"))) nodes.push(n as Text);
          }
          const length = nodes.reduce((sum, n) => sum + n.data.length, 0);
          if (rest <= length) {
            for (const n of nodes) {
              if (rest <= n.data.length) return [n, rest];
              rest -= n.data.length;
            }
            return [line, 0];
          }
          rest -= length + 1;
        }
        return [content, 0];
      };
      const [a, ao] = locate(s);
      const [b, bo] = locate(e);
      getSelection()!.setBaseAndExtent(a, ao, b, bo);
    },
    [start, end]
  );
}

/** Puts the caret at `offset` in the editor text. */
export const placeCaret = (page: Page, offset: number) => selectRange(page, offset, offset);

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
