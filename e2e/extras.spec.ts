import { test, expect } from "@playwright/test";
import { createNote, editor, gotoFresh, preview } from "./helpers";

test("math renders with KaTeX and diagrams with Mermaid, within the CSP", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });

  await gotoFresh(page);
  await createNote(page);
  await editor(page).fill(
    "Inline $a^2 + b^2 = c^2$ and a price of $5.\n\n$$\n\\sum_{i=1}^n i = \\frac{n(n+1)}{2}\n$$\n\n```mermaid\ngraph TD\n  Draft --> Review\n  Review --> Published\n```"
  );

  await expect(preview(page).locator(".katex")).toHaveCount(2);
  await expect(preview(page).locator(".katex-display")).toHaveCount(1);
  await expect(preview(page)).toContainText("a price of $5.");

  const diagram = preview(page).locator('[data-mermaid="rendered"] svg');
  await expect(diagram).toBeVisible({ timeout: 15_000 });
  await expect(diagram).toContainText("Review");

  expect(violations).toEqual([]);
});

test("a broken diagram shows the error and the source instead of failing", async ({ page }) => {
  await gotoFresh(page);
  await createNote(page);
  await editor(page).fill("```mermaid\nthis is not a diagram\n```");
  await expect(preview(page).getByRole("alert")).toContainText("Mermaid:", { timeout: 15_000 });
  await expect(preview(page).getByRole("alert")).toContainText("this is not a diagram");
});
