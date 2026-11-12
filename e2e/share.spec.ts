import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { createNote, editor, gotoFresh, titleInput } from "./helpers";

// A 2x2 red PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP8z8Dwn4EIAAA7qQH/5fIsfAAAAABJRU5ErkJggg==",
  "base64"
);

test("a note is shared as a read-only link that opens in a browser with nothing else, and can be revoked", async ({
  browser,
}) => {
  const owner = await (await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] })).newPage();
  await gotoFresh(owner);
  await createNote(owner);
  await titleInput(owner).fill("Trip plan");
  await owner.getByTestId("attach-input").setInputFiles({ name: "map.png", mimeType: "image/png", buffer: PNG });
  await editor(owner).pressSequentially("\n\nBook the **ferry** in secret-word-42");

  await owner.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = owner.getByRole("dialog", { name: "Share a read-only link" });
  await expect(dialog).toContainText("never sent to the server");
  const violations = (await new AxeBuilder({ page: owner }).include("dialog[open]").withTags(["wcag2a", "wcag2aa"]).analyze())
    .violations;
  expect(violations).toEqual([]);

  // Everything the browser sends while the link is made.
  const sent: string[] = [];
  owner.on("request", (r) => sent.push(`${r.url()} ${r.postData() ?? ""}`));
  await dialog.getByLabel("The link works for").selectOption("30");
  await dialog.getByRole("button", { name: "Create link" }).click();
  await expect(dialog.getByRole("status")).toContainText("Link created");
  const link = await dialog.getByLabel("Share link").inputValue();
  expect(link).toMatch(/\/share#[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
  const key = link.split("#")[1].split(".")[1];

  // The server got ciphertext: neither the text nor the key is in anything sent.
  const upload = sent.filter((s) => s.includes("/api/share"));
  expect(upload.length).toBeGreaterThan(0);
  for (const s of upload) {
    expect(s).not.toContain("secret-word-42");
    expect(s).not.toContain("Trip plan");
    expect(s).not.toContain(key);
  }

  // A different browser, with no notes and no key of its own, opens the link.
  const viewer = await (await browser.newContext()).newPage();
  const viewerRequests: string[] = [];
  viewer.on("request", (r) => viewerRequests.push(r.url()));
  await viewer.goto(link);
  await expect(viewer.getByRole("heading", { name: "Trip plan" })).toBeVisible();
  const article = viewer.getByRole("article", { name: "Shared note" });
  await expect(article).toContainText("secret-word-42");
  await expect(article.locator("strong")).toHaveText("ferry");
  await expect(article.locator("img[data-attachment]")).toBeVisible();
  await expect
    .poll(() => article.locator("img[data-attachment]").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(2);
  // The key stayed in the fragment: no request, and no Referer, carries it.
  expect(viewerRequests.some((u) => u.includes(key))).toBe(false);
  // A reader cannot edit anything.
  await expect(viewer.locator("textarea, .cm-content, input")).toHaveCount(0);
  const readerAxe = await new AxeBuilder({ page: viewer }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(readerAxe.violations).toEqual([]);

  // A link with one character of the key changed does not open.
  const tampered = link.slice(0, -1) + (link.endsWith("A") ? "B" : "A");
  await viewer.goto("about:blank");
  await viewer.goto(tampered);
  await expect(viewer.locator("main").getByRole("alert")).toContainText("not valid");

  // Revoking stops the link for everyone.
  await dialog.getByRole("button", { name: /^Revoke the link/ }).click();
  await expect(dialog.getByRole("status")).toContainText("Link revoked");
  await expect(dialog).toContainText("No links yet");
  await viewer.goto("about:blank");
  await viewer.goto(link);
  await expect(viewer.locator("main").getByRole("alert")).toContainText("expired or was revoked");
});

test("a malformed, made-up or empty link explains itself", async ({ page }) => {
  await page.goto("/share#nothing");
  await expect(page.locator("main").getByRole("alert")).toContainText("not valid");
  await page.goto(`/share#${"a".repeat(22)}.${"b".repeat(43)}`);
  await expect(page.locator("main").getByRole("alert")).toContainText("expired or was revoked");
  await page.goto("/share");
  await expect(page.locator("main").getByRole("alert")).toContainText("not valid");
});
