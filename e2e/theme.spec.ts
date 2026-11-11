import { test, expect, type Page } from "@playwright/test";
import { gotoFresh } from "./helpers";

const theme = (page: Page) => page.locator("html").getAttribute("data-theme");
const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("with a dark system theme", () => {
  test.use({ colorScheme: "dark" });

  test("the theme can be chosen from the menu and is applied before the app loads", async ({ page }) => {
    await gotoFresh(page);
    expect(await theme(page)).toBe("dark");
    const dark = await background(page);

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await background(page)).not.toBe(dark);

    // On reload the boot script sets the theme from storage before any React code runs.
    await page.goto("/", { waitUntil: "commit" });
    await page.waitForFunction(() => document.body !== null);
    expect(await theme(page)).toBe("light");
  });
});

test.describe("with a light system theme", () => {
  test.use({ colorScheme: "light" });

  test("follows the system by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
