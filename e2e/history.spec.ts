import { test, expect } from "@playwright/test";
import { createNote, editor, gotoFresh, titleInput } from "./helpers";

test("earlier versions of a note can be viewed and restored", async ({ page }) => {
  await page.clock.install();
  await gotoFresh(page);
  await createNote(page);
  await titleInput(page).fill("Essay");
  await editor(page).fill("First draft");

  // A new editing session, minutes later: the first draft is kept.
  await page.clock.fastForward("06:00");
  await editor(page).fill("Second draft");
  await page.clock.fastForward("06:00");
  await editor(page).fill("Final text");

  await page.getByRole("button", { name: "History" }).click();
  const dialog = page.getByRole("dialog", { name: "Note history" });
  const versions = dialog.getByRole("list", { name: "Note history" }).getByRole("button");
  await expect(versions).toHaveCount(2);
  await expect(versions.nth(0)).toContainText("Second draft");
  await versions.nth(1).click();
  await expect(dialog.getByLabel(/^Version from/)).toContainText("First draft");

  await dialog.getByRole("button", { name: "Restore this version" }).click();
  await expect(editor(page)).toHaveValue("First draft");
  await expect(page.getByRole("status").filter({ hasText: "Restored an earlier version" })).toBeVisible();

  // The text that was replaced is in the history now, so the restore can be undone.
  await page.getByRole("button", { name: "History" }).click();
  await expect(dialog.getByRole("list", { name: "Note history" }).getByRole("button").first()).toContainText("Final text");
});

test("a database from before the history store upgrades without losing notes", async ({ page }) => {
  // Create the version 1 database the previous build used, before the app runs.
  await page.goto("/manifest.webmanifest");
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("notevoid", 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore("notes", { keyPath: "id" });
          db.createObjectStore("meta");
        };
        req.onsuccess = () => {
          const tx = req.result.transaction(["notes", "meta"], "readwrite");
          tx.objectStore("notes").put({ id: "old", title: "Kept", content: "From v1", createdAt: 1, updatedAt: 1 });
          tx.objectStore("meta").put({ folders: [], tombstones: {}, activeId: "old" }, "state");
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
        };
        req.onerror = () => reject(req.error);
      })
  );

  await page.goto("/");
  await expect(titleInput(page)).toHaveValue("Kept");
  const stores = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open("notevoid");
        req.onsuccess = () => {
          resolve([...req.result.objectStoreNames]);
          req.result.close();
        };
      })
  );
  expect(stores.sort()).toEqual(["attachments", "history", "meta", "notes"]);
});
