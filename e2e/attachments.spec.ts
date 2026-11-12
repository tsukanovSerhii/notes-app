import { test, expect, type Page } from "@playwright/test";
import { createNote, editor, gotoFresh, preview } from "./helpers";

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

  await expect(editor(page)).toHaveValue(/^!\[red square\]\(attachment:[a-f0-9]{64}\)\n$/);
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
  await editor(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(7, 7));

  const paste = () =>
    editor(page).evaluate(async (el, base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], "image.png", { type: "image/png" }));
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, PNG.toString("base64"));
  await paste();

  await expect(editor(page)).toHaveValue(/^before \n!\[image\]\(attachment:[a-f0-9]{64}\)\nafter$/);
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

  await expect(editor(page)).toHaveValue(/^Notes\n\n!\[dot\]\(attachment:[a-f0-9]{64}\)\n\[report\.pdf\]\(attachment:[a-f0-9]{64}\)\n$/);
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
  await expect(editor(page)).toHaveValue("");
});

test("a link to a file this device does not have shows a placeholder, not a broken image", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await editor(page).fill(`![diagram](attachment:${"c".repeat(64)})`);
  await expect(preview(page).locator("[data-attachment-missing]")).toContainText("diagram: Image not available");
});
