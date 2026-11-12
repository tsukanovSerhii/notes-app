import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { createNote, gotoFresh, noteRow, titleInput } from "./helpers";

async function openSync(page: Page) {
  await page.getByRole("button", { name: /^Sync settings/ }).click();
  return page.getByRole("dialog");
}

test("replacing the key cuts off another device, which rejoins with the new key", async ({ browser }) => {
  const phone = await (await browser.newContext()).newPage();
  const laptop = await (await browser.newContext()).newPage();

  await gotoFresh(phone);
  await createNote(phone);
  const title = `Before rotation ${Date.now()}`;
  await titleInput(phone).fill(title);
  let dialog = await openSync(phone);
  await dialog.getByRole("button", { name: "Turn on sync" }).click();
  const oldKey = (await dialog.getByTestId("sync-key").textContent())!.trim();
  await expect(dialog.getByRole("status").first()).toContainText("Last synced");
  // A recovery code made now opens the old key, so replacing the key must retire it.
  await dialog.getByRole("button", { name: "Create a recovery code" }).click();
  const oldCode = (await dialog.getByTestId("recovery-code").textContent())!.trim();
  await dialog.getByRole("button", { name: "I have saved it" }).click();
  await page_escape(phone);

  await gotoFresh(laptop);
  dialog = await openSync(laptop);
  await dialog.getByLabel("Use an existing key").fill(oldKey);
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog.getByTestId("sync-key")).toHaveText(oldKey);
  await page_escape(laptop);
  await expect(noteRow(laptop, title)).toBeVisible();

  // The phone replaces the key; it asks twice because this disconnects everything else.
  dialog = await openSync(phone);
  await dialog.getByRole("button", { name: "Replace the key…" }).click();
  await expect(dialog).toContainText("Every other device stops syncing");
  await dialog.getByRole("button", { name: "Replace the key", exact: true }).click();
  await expect(dialog.getByRole("status").filter({ hasText: "The key was replaced" })).toContainText("no longer work");
  const newKey = (await dialog.getByTestId("sync-key").textContent())!.trim();
  expect(newKey).not.toBe(oldKey);
  await expect(dialog).toContainText("Not set up");

  // The laptop finds out at its next sync, keeps its notes and offers to rejoin.
  dialog = await openSync(laptop);
  await dialog.getByRole("button", { name: "Sync now" }).click();
  await expect(dialog.getByRole("alert")).toContainText("replaced on another device");
  await expect(laptop.getByRole("button", { name: /^Sync settings: Disconnected/ })).toBeVisible();
  const violations = (await new AxeBuilder({ page: laptop }).include("dialog[open]").withTags(["wcag2a", "wcag2aa"]).analyze())
    .violations;
  expect(violations).toEqual([]);
  await page_escape(laptop);
  await expect(noteRow(laptop, title)).toBeVisible();

  // The old recovery code no longer brings anything back.
  const stranger = await (await browser.newContext()).newPage();
  await gotoFresh(stranger);
  dialog = await openSync(stranger);
  await dialog.getByLabel("Recovery code").fill(oldCode);
  await dialog.getByRole("button", { name: "Recover" }).click();
  await expect(dialog.getByRole("alert")).toContainText("No sync key is stored");

  // The new key brings the laptop back.
  dialog = await openSync(laptop);
  await dialog.getByLabel("Use an existing key").fill(newKey);
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(dialog.getByTestId("sync-key")).toHaveText(newKey);
  await expect(dialog.getByRole("status").first()).toContainText("Last synced");
  await page_escape(laptop);
  await expect(noteRow(laptop, title)).toBeVisible();
});

async function page_escape(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
}
