import { test, expect } from "@playwright/test";
import { gotoFresh } from "./helpers";

test("the language can be switched from the menu and is remembered", async ({ page }) => {
  await gotoFresh(page);
  await expect(page.getByRole("button", { name: /^New note/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitemradio", { name: "Українська" }).click();
  await expect(page.getByRole("button", { name: /^Нова нотатка/ }).first()).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Пошук нотаток" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Нотаток ще немає" })).toBeVisible();

  await page.getByRole("button", { name: "Інші дії" }).click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "No notes yet" })).toBeVisible();
});

test.describe("with a Ukrainian browser", () => {
  test.use({ locale: "uk-UA" });

  test("starts in Ukrainian with a Ukrainian welcome note", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('input[aria-label="Назва нотатки"]')).toHaveValue("Вітаємо в NoteVoid");
    await expect(page.getByRole("navigation", { name: "Бібліотека" })).toContainText("Усі нотатки");
    // Counts use Ukrainian plural forms.
    await expect(page.getByText(/\d+ (слово|слова|слів) ·/)).toBeVisible();
  });
});
