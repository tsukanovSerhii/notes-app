import { test, expect } from "@playwright/test";
import { createNote, editor, gotoFresh, noteRow, titleInput } from "./helpers";

test("renaming a note updates the [[links]] to it in other notes", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await titleInput(page).fill("Budget");
  await editor(page).fill("Numbers.");

  await createNote(page);
  await titleInput(page).fill("Plan");
  await editor(page).fill("See [[Budget]] and [[budget|the money]].\n\n`[[Budget]]` stays in code.");

  await noteRow(page, "Budget").click();
  await titleInput(page).fill("Finance");
  await titleInput(page).blur();

  await expect(page.getByRole("status").filter({ hasText: "Updated links in 1 note" })).toBeVisible();
  await noteRow(page, "Plan").click();
  await expect(editor(page)).toHaveValue(
    "See [[Finance]] and [[Finance|the money]].\n\n`[[Budget]]` stays in code."
  );

  // The old text is kept in the history, so the rewrite can be undone.
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("dialog", { name: "Note history" })).toContainText("[[Budget]]");
});
