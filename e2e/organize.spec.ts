import { test, expect, type Page } from "@playwright/test";
import { createNote, gotoFresh, noteList, noteRow, titleInput } from "./helpers";

const library = (page: Page) => page.getByRole("navigation", { name: "Library" });

test.beforeEach(async ({ page }) => {
  await gotoFresh(page);
});

test("notes can be dragged into a folder, out of it and into the trash", async ({ page }) => {
  await library(page).getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("New folder name").fill("Work");
  await page.keyboard.press("Enter");
  await library(page).getByRole("button", { name: /^All notes/ }).click();

  await createNote(page);
  await titleInput(page).fill("Report");

  const work = library(page).getByRole("button", { name: /^Work/ });
  await noteRow(page, "Report").getByRole("button").first().dragTo(work);
  await expect(page.getByRole("status")).toContainText("Moved “Report” to Work");
  await expect(work).toContainText("1");
  await expect(page.getByRole("combobox", { name: "Folder" })).not.toHaveValue("");

  await noteRow(page, "Report").getByRole("button").first().dragTo(library(page).getByRole("button", { name: /^All notes/ }));
  await expect(work).toContainText("0");

  await noteRow(page, "Report").getByRole("button").first().dragTo(library(page).getByRole("button", { name: /^Trash/ }));
  await expect(page.getByRole("status")).toContainText("Moved “Report” to the trash");
  await expect(noteRow(page, "Report")).toBeHidden();
});

test("the list can be sorted by title or creation, and remembers it", async ({ page }) => {
  for (const title of ["Banana", "apple", "Cherry"]) {
    await createNote(page);
    await titleInput(page).fill(title);
  }
  // The first line of each row is the title.
  const titles = () =>
    noteList(page)
      .locator("li > button > span:first-child")
      .evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));
  const sort = page.getByRole("combobox", { name: "Sort by" });

  await sort.selectOption("title");
  await expect.poll(titles).toEqual(["apple", "Banana", "Cherry"]);
  await sort.selectOption("created");
  await expect.poll(titles).toEqual(["Cherry", "apple", "Banana"]);

  await page.reload();
  await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveValue("created");
});
