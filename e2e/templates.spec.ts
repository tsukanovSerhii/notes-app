import { test, expect } from "@playwright/test";
import { createNote, editor, gotoFresh, noteRow, titleInput } from "./helpers";

test("a note can be saved as a template and used in other notes, with the date filled in", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await titleInput(page).fill("Weekly review");
  await editor(page).fill("# Review {{date}}\n\n- [ ] wins");

  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save this note as a template…" }).click();
  await expect(page.getByRole("status")).toContainText("Saved “Weekly review” as a template");
  // The note being edited stays open, and the template lives in a Templates folder.
  await expect(titleInput(page)).toHaveValue("Weekly review");
  await expect(page.getByRole("navigation", { name: "Library" })).toContainText("Templates");

  await createNote(page);
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("menuitem", { name: "Weekly review" }).click();
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await expect(editor(page)).toHaveValue(`# Review ${iso}\n\n- [ ] wins`);
  await expect(titleInput(page)).toHaveValue("Weekly review");

  // Saving the same note again updates the template instead of adding another.
  await noteRow(page, "Weekly review").first().click();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save this note as a template…" }).click();
  await expect(page.getByRole("status")).toContainText(/Saved|Updated/);
});
