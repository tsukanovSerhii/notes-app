import { test, expect } from "@playwright/test";
import { gotoFresh, createNote, editor, titleInput } from "./helpers";

test.describe("PDF export", () => {
  test("Export button is disabled with no active note", async ({ page }) => {
    await gotoFresh(page);

    await expect(page.getByRole("button", { name: /^Export/ })).toBeDisabled();
  });

  test("exports the active note to a non-empty PDF", async ({ page }) => {
    await gotoFresh(page);
    await createNote(page);
    await titleInput(page).fill("Report");
    await editor(page).fill(
      "# Title\n\nText with **bold** and a task:\n- [x] done\n- [ ] todo"
    );

    const exportBtn = page.getByRole("button", { name: /^Export/ });
    await expect(exportBtn).toBeEnabled();

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await exportBtn.click();
    await page.getByRole("menuitem", { name: "PDF document" }).click();

    await expect(page.getByText(/Exporting/i)).toBeVisible();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("Report.pdf");

    const path = await download.path();
    expect(path).toBeTruthy();
    const { statSync } = await import("fs");
    expect(statSync(path!).size).toBeGreaterThan(1000);

    await expect(exportBtn).toHaveText(/^Export$/);
  });

  test("exports the active note as a Markdown file", async ({ page }) => {
    await gotoFresh(page);
    await createNote(page);
    await titleInput(page).fill("Plan: v2");
    await editor(page).fill("# Plan\n\n- [ ] ship");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /^Export/ }).click();
    await page.getByRole("menuitem", { name: /Markdown/ }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("Plan v2.md");
    const { readFileSync } = await import("fs");
    expect(readFileSync((await download.path())!, "utf8")).toBe(
      "# Plan\n\n- [ ] ship\n"
    );
  });
});
