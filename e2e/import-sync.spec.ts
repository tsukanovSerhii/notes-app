import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { storedSyncData } from "./syncStorage";
import { gotoFresh, createNote, editor, noteList, titleInput, noteRow } from "./helpers";

test.describe("Import & backup", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("imports Markdown files as notes", async ({ page }) => {
    await page.getByTestId("import-markdown").setInputFiles([
      { name: "plan.md", mimeType: "text/markdown", buffer: Buffer.from("# Launch plan\n\n- [ ] ship") },
      { name: "Shopping.txt", mimeType: "text/plain", buffer: Buffer.from("milk, eggs") },
    ]);
    await expect(page.getByRole("status")).toContainText("Imported 2 notes");
    await expect(noteRow(page, "Launch plan")).toBeVisible();
    await expect(noteRow(page, "Shopping")).toBeVisible();
  });

  test("downloads a backup and restores deleted notes from it", async ({ page }) => {
    await createNote(page);
    await titleInput(page).fill("Precious");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Download backup/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^notevoid-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const backup = readFileSync((await download.path())!, "utf8");
    expect(JSON.parse(backup)).toMatchObject({ app: "notevoid", notes: [{ title: "Precious" }] });

    await noteRow(page, "Precious").hover();
    await noteRow(page, "Precious").getByRole("button", { name: "Delete note" }).click();
    await expect(noteRow(page, "Precious")).toBeHidden();

    await page.getByTestId("import-backup").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup),
    });
    await expect(noteRow(page, "Precious")).toBeVisible();
  });

  test("rejects a file that is not a backup", async ({ page }) => {
    await page.getByTestId("import-backup").setInputFiles({
      name: "random.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"hello": "world"}'),
    });
    await expect(page.getByRole("status")).toContainText("not a NoteVoid backup");
  });
});

test("syncs notes between two devices through the server", async ({ browser }) => {
  const startedAt = Date.now();
  const phone = await (await browser.newContext()).newPage();
  const laptop = await (await browser.newContext()).newPage();

  await gotoFresh(phone);
  await createNote(phone);
  await titleInput(phone).fill(`Phone note ${Date.now()}`);
  const phoneTitle = await titleInput(phone).inputValue();

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
  await expect(noteRow(laptop, phoneTitle)).toBeVisible();

  // An edit on the laptop reaches the phone.
  await createNote(laptop);
  await titleInput(laptop).fill("Written on the laptop");
  await phone.getByRole("button", { name: /^Sync settings/ }).click();
  await expect
    .poll(async () => {
      await phone.getByRole("button", { name: "Sync now" }).click();
      return noteRow(phone, "Written on the laptop").isVisible();
    }, { timeout: 15_000 })
    .toBe(true);
  await phone.keyboard.press("Escape");

  // Both edit the same note while the phone is offline: neither text is lost.
  await phone.context().setOffline(true);
  await noteRow(phone, phoneTitle).click();
  await editor(phone).fill("Phone version");
  await noteRow(laptop, phoneTitle).click();
  await editor(laptop).fill("Laptop version");
  await laptop.getByRole("button", { name: /^Sync settings/ }).click();
  await laptop.getByRole("button", { name: "Sync now" }).click();
  await expect(laptop.getByRole("dialog").getByRole("status")).toContainText("Last synced");

  await phone.context().setOffline(false);
  await phone.getByRole("button", { name: /^Sync settings/ }).click();
  await phone.getByRole("button", { name: "Sync now" }).click();
  await phone.keyboard.press("Escape");
  await expect(phone.getByRole("status").filter({ hasText: "edited on another device too" })).toBeVisible();

  const copyRow = noteList(phone).locator("li").filter({ hasText: phoneTitle }).filter({ hasText: "conflict copy" });
  await expect(copyRow).toHaveCount(1);
  await copyRow.click();
  await expect(editor(phone)).toHaveValue("Phone version");
  await noteList(phone)
    .locator("li")
    .filter({ hasText: phoneTitle })
    .filter({ hasNotText: "conflict copy" })
    .click();
  await expect(editor(phone)).toHaveValue("Laptop version");

  // End-to-end encryption: what the server stored never contains the notes' text or the key.
  const stored = await storedSyncData(startedAt);
  expect(stored.length).toBeGreaterThan(0);
  for (const secret of [phoneTitle, "Phone version", "Laptop version", "Written on the laptop", key]) {
    expect(stored).not.toContain(secret);
  }
});
