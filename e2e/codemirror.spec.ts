import { test, expect } from "@playwright/test";
import { createNote, editor, expectEditorValue, gotoFresh } from "./helpers";

/** The menu ignores keys for a moment after it opens, so a stray Enter cannot pick something. */
const MENU_DELAY_MS = 400;

test("typing / offers blocks to insert and Enter inserts the chosen one", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);

  await editor(page).pressSequentially("/head");
  const options = page.getByRole("listbox").getByRole("option");
  await expect(options).toHaveText([/Heading 1/, /Heading 2/, /Heading 3/]);
  await page.waitForTimeout(MENU_DELAY_MS);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expectEditorValue(editor(page), "## ");

  await editor(page).pressSequentially("Plan\n/tab");
  await expect(options).toHaveText([/Table/]);
  await page.waitForTimeout(MENU_DELAY_MS);
  await page.keyboard.press("Enter");
  await expectEditorValue(editor(page), /^## Plan\n\| Column A \| Column B \|\n\| --- \| --- \|\n\| cell \| cell \|\n$/);
});

test("a slash inside a URL or a word opens no menu, and Escape closes the menu", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await editor(page).pressSequentially("see https://example.com/pa and/or");
  await expect(page.getByRole("listbox")).toBeHidden();

  await editor(page).pressSequentially(" /da");
  await expect(page.getByRole("option", { name: /Today's date/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expectEditorValue(editor(page), "see https://example.com/pa and/or /da");
});

test("the date block inserts today's date, and the file block opens the file picker", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await editor(page).pressSequentially("/date");
  await expect(page.getByRole("option", { name: /Today's date/ })).toBeVisible();
  await page.waitForTimeout(MENU_DELAY_MS);
  await page.keyboard.press("Enter");
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await expectEditorValue(editor(page), iso);

  await editor(page).press("Control+a");
  await editor(page).press("Delete");
  await editor(page).pressSequentially("/image");
  await expect(page.getByRole("option", { name: /Image or file/ })).toBeVisible();
  await page.waitForTimeout(MENU_DELAY_MS);
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles({ name: "dot.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64") });
  await expectEditorValue(editor(page), /^!\[dot\]\(attachment:[a-f0-9]{64}\)\n$/);
});

test("Markdown is coloured as you write it", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await editor(page).fill("# Title\n\nplain **strong** and [[Note]]");
  const style = (text: string) =>
    editor(page).evaluate((root, fragment) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.textContent?.includes(fragment) && !n.parentElement?.closest(".cm-placeholder")) {
          const s = getComputedStyle(n.parentElement!);
          return { color: s.color, weight: s.fontWeight };
        }
      }
      throw new Error("text not found: " + fragment);
    }, text);
  const plain = await style("plain");
  const heading = await style("Title");
  const strong = await style("strong");
  const wiki = await style("Note");
  expect(heading.color).not.toBe(plain.color);
  expect(Number(heading.weight)).toBeGreaterThanOrEqual(700);
  expect(Number(strong.weight)).toBeGreaterThanOrEqual(700);
  expect(wiki.color).toBe(heading.color);
});

test("Vim keys can be switched on in the menu, and stay on after a reload", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await page.getByRole("button", { name: "More actions" }).click();
  const toggle = page.getByRole("menuitemcheckbox", { name: "Vim keys in the editor" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();

  // In normal mode "i" only switches to insert mode; it is not typed.
  await editor(page).click();
  await expect(page.locator(".cm-vimMode, .cm-fat-cursor").first()).toBeVisible();
  await page.keyboard.type("ihello");
  await page.keyboard.press("Escape");
  await page.keyboard.type("x");
  await expectEditorValue(editor(page), "hell");

  await page.reload();
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Vim keys in the editor" })).toHaveAttribute("aria-checked", "true");
});
