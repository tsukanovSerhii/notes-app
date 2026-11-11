import { test, expect } from "@playwright/test";
import { createNote, editor, gotoFresh, noteRow, preview, titleInput } from "./helpers";

// The service worker is registered only in production builds, which is what
// CI tests (`next start`); locally the suite runs against `next dev`.
test.skip(!process.env.CI, "needs a production build: run with CI=1 after `npm run build`");

test.describe("Offline", () => {
  test("serves a web app manifest with installable icons", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({ short_name: "NoteVoid", display: "standalone", start_url: "/" });
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  });

  test("the app opens and keeps working without a network after the first visit", async ({
    page,
    context,
  }) => {
    await gotoFresh(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      // Wait until the worker controls the page, so the shell is cached.
      if (!navigator.serviceWorker.controller) {
        await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r));
      }
    });

    await createNote(page);
    await titleInput(page).fill("Written online");
    await editor(page).fill("# Still here");

    await context.setOffline(true);
    await page.reload();

    await expect(noteRow(page, "Written online")).toBeVisible();
    await expect(preview(page).locator("h1")).toHaveText("Still here");

    // Editing offline persists to IndexedDB and survives another offline reload.
    await createNote(page);
    await titleInput(page).fill("Written offline");
    await page.waitForTimeout(600); // let the debounced save land
    await page.reload();
    await expect(noteRow(page, "Written offline")).toBeVisible();

    await context.setOffline(false);
  });
});
