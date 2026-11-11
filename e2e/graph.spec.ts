import { test, expect } from "@playwright/test";
import { createNote, editor, gotoFresh, titleInput } from "./helpers";

test("the note graph shows linked notes and opens one on click", async ({ page }) => {
  await gotoFresh(page);
  const make = async (title: string, body: string) => {
    await createNote(page);
    await titleInput(page).fill(title);
    await editor(page).fill(body);
  };
  await make("Hub", "Links to [[Spoke A]] and [[Spoke B]].");
  await make("Spoke A", "Back to [[Hub]].");
  await make("Spoke B", "Nothing else.");
  await make("Lonely", "No links.");

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Note graph" }).click();

  const dialog = page.getByRole("dialog", { name: "Note graph" });
  // Lonely has no links; the three linked notes are drawn.
  await expect(dialog.locator("[data-graph-node]")).toHaveCount(3);
  await expect(dialog).toContainText("Not shown, because they have no links: 1 note.");
  await expect(dialog.getByRole("button", { name: /^Hub \(3 links\)$/ })).toBeVisible();

  await dialog.getByRole("button", { name: /^Spoke A/ }).click();
  await expect(dialog).toBeHidden();
  await expect(titleInput(page)).toHaveValue("Spoke A");
});

test("the graph explains itself when nothing is linked", async ({ page }) => {
  await gotoFresh(page);
  await page.keyboard.press("Control+Shift+P");
  await page.keyboard.type("graph");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Note graph" })).toContainText("No links between notes yet");
});
