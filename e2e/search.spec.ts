import { test, expect } from "@playwright/test";
import { createNote, editor, gotoFresh, noteList, noteRow, titleInput } from "./helpers";

test("search highlights matches and shows the text around them", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await titleInput(page).fill("Quarterly plan");
  await editor(page).fill(
    "# Quarterly plan\n\nA long introduction that says nothing in particular, then the **budget** is due on Friday, followed by more words."
  );

  await page.getByRole("searchbox", { name: "Search notes" }).fill("budget");
  const row = noteRow(page, "Quarterly plan");
  await expect(row.locator("mark")).toHaveText(["budget"]);
  // A snippet from the middle of the text, not its first line.
  await expect(row).toContainText(/…[^…]*then the budget is due on Friday[^…]*…/);
  await expect(row).not.toContainText("A long introduction");

  await page.getByRole("searchbox", { name: "Search notes" }).fill("plan");
  await expect(noteList(page).locator("mark").first()).toHaveText("plan");
});
