import { test, expect } from "@playwright/test";
import { createNote, editor, gotoFresh, noteList, titleInput } from "./helpers";

test("search ranks title matches first, forgives typos and finds Ukrainian text", async ({ page }) => {
  const violations: string[] = [];
  const workers: string[] = [];
  page.on("worker", (w) => workers.push(w.url()));
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });

  await gotoFresh(page);
  const make = async (title: string, body: string) => {
    await createNote(page);
    await titleInput(page).fill(title);
    await editor(page).fill(body);
  };
  await make("Weekly meeting", "We reviewed the quarterly budget and hiring.");
  await make("Quarterly budget", "Totals.");
  await make("Рецепт борщу", "буряк, капуста, картопля");

  const search = page.getByRole("searchbox", { name: "Search notes" });
  const titles = () =>
    noteList(page).locator("li > button > span:first-child").evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));

  // Both mention "budget"; the one with it in the title comes first.
  await search.fill("budget");
  await expect.poll(titles).toEqual(["Quarterly budget", "Weekly meeting"]);

  // A typo in a longer word still finds it.
  await search.fill("quartrly");
  await expect.poll(titles).toEqual(["Quarterly budget", "Weekly meeting"]);

  await search.fill("капуста");
  await expect.poll(titles).toEqual(["Рецепт борщу"]);

  await search.fill("zzzzzz");
  await expect(page.getByText("No notes match.")).toBeVisible();
  expect(violations).toEqual([]);
  // The index runs in a real Web Worker, not inline on the page.
  expect(workers).toHaveLength(1);
  expect(workers[0]).toMatch(/\/_next\/static\//);
});
