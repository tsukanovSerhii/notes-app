import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { createNote, gotoFresh, noteRow, titleInput } from "./helpers";

async function turnOnSync(page: Page) {
  await page.getByRole("button", { name: /^Sync settings/ }).click();
  await page.getByRole("button", { name: "Turn on sync" }).click();
  const key = (await page.getByTestId("sync-key").textContent())!.trim();
  await expect(page.getByRole("dialog").getByRole("status").first()).toContainText("Last synced");
  return key;
}

test("a recovery code brings the sync key back on a device that has nothing", async ({ browser }) => {
  const first = await (await browser.newContext()).newPage();
  await gotoFresh(first);
  await createNote(first);
  const title = `Recoverable ${Date.now()}`;
  await titleInput(first).fill(title);
  const key = await turnOnSync(first);

  const dialog = first.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create a recovery code" }).click();
  const code = (await dialog.getByTestId("recovery-code").textContent())!.trim();
  expect(code).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
  const { violations } = await new AxeBuilder({ page: first }).include("dialog[open]").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(violations).toEqual([]);
  await dialog.getByRole("button", { name: "I have saved it" }).click();
  await expect(dialog.getByTestId("recovery-code")).toBeHidden();
  await expect(dialog).toContainText("A code was created on");

  // The sync key is nowhere in what the browser sent to store the code.
  // (Checked on the wire in the unit tests; here the key must not be shown again either.)
  await expect(dialog).not.toContainText(code);

  const second = await (await browser.newContext()).newPage();
  await gotoFresh(second);
  await second.getByRole("button", { name: /^Sync settings/ }).click();
  const join = second.getByRole("dialog");

  // A wrong code finds nothing and says so.
  await join.getByLabel("Recovery code").fill("AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA");
  await join.getByRole("button", { name: "Recover" }).click();
  await expect(join.getByRole("alert")).toContainText("No sync key is stored");
  await join.getByLabel("Recovery code").fill("AAAA-AAAA");
  await join.getByRole("button", { name: "Recover" }).click();
  await expect(join.getByRole("alert")).toContainText("whole recovery code");

  // The right one, typed in lower case without dashes, joins the space.
  await join.getByLabel("Recovery code").fill(code.toLowerCase().replace(/-/g, " "));
  await join.getByRole("button", { name: "Recover" }).click();
  await expect(join.getByTestId("sync-key")).toHaveText(key);
  await second.keyboard.press("Escape");
  await expect(noteRow(second, title)).toBeVisible({ timeout: 20_000 });
});

test("a new code replaces the old one, and removing it stops recovery", async ({ browser }) => {
  const first = await (await browser.newContext()).newPage();
  await gotoFresh(first);
  await turnOnSync(first);
  const dialog = first.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create a recovery code" }).click();
  const oldCode = (await dialog.getByTestId("recovery-code").textContent())!.trim();
  await dialog.getByRole("button", { name: "I have saved it" }).click();
  await dialog.getByRole("button", { name: "Make a new code" }).click();
  const newCode = (await dialog.getByTestId("recovery-code").textContent())!.trim();
  expect(newCode).not.toBe(oldCode);

  const other = await (await browser.newContext()).newPage();
  await gotoFresh(other);
  await other.getByRole("button", { name: /^Sync settings/ }).click();
  const join = other.getByRole("dialog");
  await join.getByLabel("Recovery code").fill(oldCode);
  await join.getByRole("button", { name: "Recover" }).click();
  await expect(join.getByRole("alert")).toContainText("No sync key is stored");

  await dialog.getByRole("button", { name: "I have saved it" }).click();
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(dialog).toContainText("Not set up");
  await join.getByLabel("Recovery code").fill(newCode);
  await join.getByRole("button", { name: "Recover" }).click();
  await expect(join.getByRole("alert")).toContainText("No sync key is stored");
});

test("a passkey with the PRF extension brings the key back after this browser forgets everything", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });

  await gotoFresh(page);
  await createNote(page);
  const title = `Passkey note ${Date.now()}`;
  await titleInput(page).fill(title);
  const key = await turnOnSync(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Add a passkey" }).click();
  await expect(dialog).toContainText("A passkey was added on");

  // Close the dialog first, so it is not left over the reload.
  await page.keyboard.press("Escape");
  // This browser "forgets" the app: no notes, no key. The passkey stays in the authenticator.
  await page.evaluate(async () => {
    localStorage.clear();
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs.map(
        (d) =>
          new Promise((resolve) => {
            const req = indexedDB.deleteDatabase(d.name!);
            req.onsuccess = req.onerror = req.onblocked = () => resolve(null);
          })
      )
    );
  });
  await page.reload();
  await page.getByRole("button", { name: /^Sync settings/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("dialog").getByTestId("sync-key")).toHaveText(key, { timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(noteRow(page, title)).toBeVisible({ timeout: 20_000 });
});
