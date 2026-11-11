import { test, expect } from "@playwright/test";
import { createNote, editor, gotoFresh, preview, titleInput } from "./helpers";

test("[[links]] open notes, create missing ones, and show up as backlinks", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await titleInput(page).fill("Budget");
  await editor(page).fill("Numbers live here.");

  await createNote(page);
  await titleInput(page).fill("Plan");
  await editor(page).fill("See [[budget|the budget]] and [[Ideas]].");

  const toBudget = preview(page).getByRole("link", { name: "the budget" });
  await expect(toBudget).toHaveAttribute("data-wiki-link", "found");
  const toIdeas = preview(page).getByRole("link", { name: "Ideas" });
  await expect(toIdeas).toHaveAttribute("data-wiki-link", "missing");

  // Following a link opens the note, and that note lists who links to it.
  await toBudget.click();
  await expect(titleInput(page)).toHaveValue("Budget");
  const linkedFrom = page.getByRole("navigation", { name: "Linked from" });
  await expect(linkedFrom.getByRole("button")).toHaveText(["Plan"]);

  // Back via the backlink, then create the missing note from its link.
  await linkedFrom.getByRole("button", { name: "Plan" }).click();
  await expect(titleInput(page)).toHaveValue("Plan");
  await preview(page).getByRole("link", { name: "Ideas" }).click();
  await expect(titleInput(page)).toHaveValue("Ideas");
});
