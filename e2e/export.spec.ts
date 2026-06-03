import { test, expect } from "@playwright/test";
import { gotoFresh, createNote, editor, titleInput } from "./helpers";

test.describe("PDF export", () => {
  test("Export button is disabled with no active note", async ({ page }) => {
    await gotoFresh(page);

    const exportBtn = page
      .getByRole("button", { name: /Export PDF/i })
      .first();
    await expect(exportBtn).toBeDisabled();
  });

  test("exports the active note to a non-empty PDF", async ({ page }) => {
    await gotoFresh(page);
    await createNote(page);
    await titleInput(page).fill("Report");
    await editor(page).fill(
      "# Title\n\nText with **bold** and a task:\n- [x] done\n- [ ] todo"
    );

    const exportBtn = page
      .getByRole("button", { name: /Export PDF/i })
      .first();
    await expect(exportBtn).toBeEnabled();

    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await exportBtn.click();

    await expect(page.getByText(/Exporting/i)).toBeVisible();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("Report.pdf");

    const path = await download.path();
    expect(path).toBeTruthy();
    const { statSync } = await import("fs");
    expect(statSync(path!).size).toBeGreaterThan(1000);

    await expect(page.getByText(/^Export PDF$/i).first()).toBeVisible();
  });
});
