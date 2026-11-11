import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { createNote, editor, gotoFresh, titleInput } from "./helpers";

/** WCAG 2.0/2.1 A and AA: the level the README promises. */
async function expectAccessible(page: Page, context: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const report = violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `  ${n.target.join(" ")}`).slice(0, 4).join("\n")}`
  );
  expect(report, `${context}\n${report.join("\n")}`).toEqual([]);
}

async function chooseMenu(page: Page, group: string, item: string) {
  await page.getByRole("button", { name: /More actions|Інші дії/ }).click();
  await page.getByRole("group", { name: group }).getByRole("menuitemradio", { name: item }).click();
  await page.keyboard.press("Escape");
}

for (const theme of ["dark", "light"] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test("the editor, preview and sidebar", async ({ page }) => {
      await gotoFresh(page);
      await createNote(page);
      await titleInput(page).fill("Accessible note");
      await editor(page).fill("# Heading\n\nSome **text** with a [link](https://example.com) and `code`.\n\n- [ ] task\n\n| a | b |\n| - | - |\n| 1 | 2 |");
      await expectAccessible(page, `split view, ${theme}`);

      await page.getByRole("button", { name: "Preview" }).click();
      await expectAccessible(page, `preview, ${theme}`);
    });

    test("dialogs and menus", async ({ page }) => {
      await gotoFresh(page);
      await page.getByRole("button", { name: /^Sync settings/ }).click();
      await expectAccessible(page, `sync dialog, ${theme}`);
      await page.keyboard.press("Escape");

      await page.keyboard.press("Control+Shift+P");
      await expectAccessible(page, `command palette, ${theme}`);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "More actions" }).click();
      await expectAccessible(page, `app menu, ${theme}`);
    });
  });
}

test.describe("Ukrainian", () => {
  test.use({ locale: "uk-UA" });

  test("the interface passes in Ukrainian too", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('input[aria-label="Назва нотатки"]')).toBeVisible();
    await expectAccessible(page, "uk, dark");
    await chooseMenu(page, "Тема", "Світла");
    await expectAccessible(page, "uk, light");
  });
});

test("the trash view", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await titleInput(page).fill("To trash");
  await page.getByRole("list", { name: "Note list" }).locator("li").first().hover();
  await page.getByRole("button", { name: "Delete note" }).first().click();
  await page.getByRole("navigation", { name: "Library" }).getByRole("button", { name: /^Trash/ }).click();
  await page.getByRole("list", { name: "Note list" }).locator("li").first().getByRole("button").first().click();
  await expectAccessible(page, "trash");
});
