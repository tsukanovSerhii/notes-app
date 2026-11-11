import { test, expect, type Page } from "@playwright/test";
import { createNote, editor, gotoFresh, preview, titleInput } from "./helpers";

/** Collects every CSP violation the page reports, from the console and the DOM event. */
function watchCsp(page: Page) {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  page.on("pageerror", (err) => {
    if (/Content Security Policy/i.test(err.message)) violations.push(err.message);
  });
  return violations;
}

test.describe("Security headers", () => {
  test("pages get a nonce-based CSP and hardening headers", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response!.headers();

    const csp = headers["content-security-policy"];
    expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-powered-by"]).toBeUndefined();

    // Every script in the server-rendered HTML carries the nonce from the
    // header. (Scripts the runtime adds later are trusted via 'strict-dynamic'.)
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    const tags = (await response!.text()).match(/<script\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toContain(`nonce="${nonce}"`);
  });

  test("the app runs without CSP violations, PDF export included", async ({ page }) => {
    const violations = watchCsp(page);
    await gotoFresh(page);
    await createNote(page);
    await titleInput(page).fill("CSP check");
    await editor(page).fill("# Heading\n\n```ts\nconst x = 1;\n```");
    await expect(preview(page).locator("h1")).toHaveText("Heading");

    const download = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: /^Export/ }).click();
    await page.getByRole("menuitem", { name: "PDF document" }).click();
    await download;

    expect(violations).toEqual([]);
  });

  test("injected markup cannot run inline event handlers", async ({ page }) => {
    await page.goto("/");
    // The classic XSS payload: markup with an inline handler slipped into the DOM.
    const result = await page.evaluate(async () => {
      // Resolves when the browser reports the blocked handler. The image
      // request has to fail first, which a busy dev server can take a while
      // to answer, so wait for the event rather than a fixed delay.
      const blocked = new Promise<string>((resolve) => {
        document.addEventListener("securitypolicyviolation", (e) => resolve(e.violatedDirective), { once: true });
        setTimeout(() => resolve(""), 10_000);
      });
      const box = document.createElement("div");
      box.innerHTML = '<img src="/missing-image.png" onerror="window.__xss = true">';
      document.body.appendChild(box);
      const directive = await blocked;
      return { ran: (window as unknown as { __xss?: boolean }).__xss === true, blocked: directive };
    });
    expect(result.ran).toBe(false);
    expect(result.blocked).toMatch(/^script-src/);
  });
});
