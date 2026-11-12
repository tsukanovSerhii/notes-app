import { test, expect } from "@playwright/test";
import { caretLine, createNote, editor, gotoFresh, preview } from "./helpers";

test("the outline lists headings and jumps to one in the editor and the preview", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 700 });
  await gotoFresh(page);
  await createNote(page);
  const filler = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} with some words to fill the page.\n`).join("\n");
  await editor(page).fill(`# Start\n\n${filler}\n## Middle part\n\n${filler}\n### The end\n\nlast`);

  await page.getByRole("button", { name: "Outline", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Outline" });
  await expect(menu.getByRole("menuitem")).toHaveText(["Start", "Middle part", "The end"]);

  await menu.getByRole("menuitem", { name: "Middle part" }).click();
  expect(await caretLine(page)).toBe("## Middle part");
  expect(await page.locator(".cm-scroller").evaluate((el) => el.scrollTop)).toBeGreaterThan(200);
  await expect(preview(page).getByRole("heading", { name: "Middle part" })).toBeInViewport();
});

test("a note without headings says so", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await editor(page).fill("just text");
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Outline" })).toContainText("No headings yet");
});
