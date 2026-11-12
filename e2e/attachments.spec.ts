import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { createNote, editor, placeCaret, gotoFresh, noteRow, preview, titleInput, expectEditorValue } from "./helpers";

// A 2x2 red PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP8z8Dwn4EIAAA7qQH/5fIsfAAAAABJRU5ErkJggg==",
  "base64"
);

const picture = (page: Page) => preview(page).locator("img[data-attachment]");

test("a picture chosen with the toolbar is stored, shown and survives a reload", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await page.getByTestId("attach-input").setInputFiles({ name: "red square.png", mimeType: "image/png", buffer: PNG });

  await expectEditorValue(editor(page), /^!\[red square\]\(attachment:[a-f0-9]{64}\)\n$/);
  await expect(picture(page)).toBeVisible();
  await expect.poll(() => picture(page).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);

  await page.reload();
  await expect(picture(page)).toBeVisible();
  await expect.poll(() => picture(page).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);
});

test("pasting a picture inserts it at the cursor, and the same file is stored once", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await editor(page).fill("before after");
  await placeCaret(page, 7);

  const paste = () =>
    editor(page).evaluate(async (el, base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], "image.png", { type: "image/png" }));
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, PNG.toString("base64"));
  await paste();

  await expectEditorValue(editor(page), /^before \n!\[image\]\(attachment:[a-f0-9]{64}\)\nafter$/);
  await paste();
  await expect(picture(page)).toHaveCount(2);

  const stored = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open("notevoid");
        open.onsuccess = () => {
          const req = open.result.transaction("attachments").objectStore("attachments").count();
          req.onsuccess = () => resolve(req.result);
        };
      })
  );
  expect(stored).toBe(1);
});

test("dropping files adds them to the open note; other files become downloads", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await editor(page).fill("Notes");

  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "dot.png", { type: "image/png" }));
    data.items.add(new File(["hello pdf"], "report.pdf", { type: "application/pdf" }));
    window.dispatchEvent(new DragEvent("dragenter", { dataTransfer: data, bubbles: true }));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, PNG.toString("base64"));

  await expectEditorValue(editor(page), /^Notes\n\n!\[dot\]\(attachment:[a-f0-9]{64}\)\n\[report\.pdf\]\(attachment:[a-f0-9]{64}\)\n$/);
  await expect(picture(page)).toBeVisible();
  const link = preview(page).getByRole("link", { name: "report.pdf" });
  await expect(link).toHaveAttribute("download", "report.pdf");
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toBe("report.pdf");
});

test("a file over the size limit is refused with a message", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await page.getByTestId("attach-input").setInputFiles({
    name: "huge.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("status").filter({ hasText: "huge.bin" })).toContainText("larger than 10 MB");
  await expectEditorValue(editor(page), "");
});

test("a link to a file this device does not have shows a placeholder, not a broken image", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await editor(page).fill(`![diagram](attachment:${"c".repeat(64)})`);
  await expect(preview(page).locator("[data-attachment-missing]")).toContainText("diagram: Image not available");
});

test("a picture reaches another device through sync", async ({ browser }) => {
  const phone = await (await browser.newContext()).newPage();
  const laptop = await (await browser.newContext()).newPage();

  await gotoFresh(phone);
  await createNote(phone);
  const title = `Pictures ${Date.now()}`;
  await titleInput(phone).fill(title);
  await phone.getByTestId("attach-input").setInputFiles({ name: "red.png", mimeType: "image/png", buffer: PNG });
  await expect(picture(phone)).toBeVisible();

  await phone.getByRole("button", { name: /^Sync settings/ }).click();
  await phone.getByRole("button", { name: "Turn on sync" }).click();
  const key = (await phone.getByTestId("sync-key").textContent())!.trim();
  await expect(phone.getByRole("dialog").getByRole("status")).toContainText("Last synced");
  await phone.keyboard.press("Escape");

  await gotoFresh(laptop);
  await laptop.getByRole("button", { name: /^Sync settings/ }).click();
  await laptop.getByLabel("Use an existing key").fill(key);
  await laptop.getByRole("button", { name: "Connect" }).click();
  await expect(laptop.getByTestId("sync-key")).toHaveText(key);
  await laptop.keyboard.press("Escape");
  await noteRow(laptop, title).click();

  // The note text arrives first; the picture follows once downloaded and checked.
  // The phone may still be uploading when the laptop first asks, so ask again.
  await expect
    .poll(
      async () => {
        await laptop.getByRole("button", { name: /^Sync settings/ }).click();
        await laptop.getByRole("button", { name: "Sync now" }).click();
        await laptop.keyboard.press("Escape");
        return picture(laptop).isVisible();
      },
      { timeout: 45_000, intervals: [3000] }
    )
    .toBe(true);
  await expect.poll(() => picture(laptop).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);
});

test("a backup carries the pictures, and importing it brings back one that was lost", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await page.getByTestId("attach-input").setInputFiles({ name: "red.png", mimeType: "image/png", buffer: PNG });
  await expect(picture(page)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: /Download backup/ }).click();
  const backup = readFileSync((await (await downloadPromise).path())!, "utf8");
  const json = JSON.parse(backup) as { attachments: { id: string; name: string; type: string }[] };
  expect(json.attachments).toHaveLength(1);
  expect(json.attachments[0]).toMatchObject({ name: "red.png", type: "image/png" });

  // Lose the file on this device: the note keeps its link, the picture is gone.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const open = indexedDB.open("notevoid");
        open.onsuccess = () => {
          const tx = open.result.transaction("attachments", "readwrite");
          tx.objectStore("attachments").clear();
          tx.oncomplete = () => resolve();
        };
      })
  );
  await page.reload();
  await expect(preview(page).locator("[data-attachment-missing]")).toBeVisible();

  await page.getByTestId("import-backup").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  await expect(picture(page)).toBeVisible();
  await expect.poll(() => picture(page).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2);
});

test("a PDF export of a note with a picture completes", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await titleInput(page).fill("With picture");
  await page.getByTestId("attach-input").setInputFiles({ name: "red.png", mimeType: "image/png", buffer: PNG });
  await expect(picture(page)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export/ }).click();
  await page.getByRole("menuitem", { name: /PDF/ }).click();
  expect((await download).suggestedFilename()).toBe("With picture.pdf");
});
