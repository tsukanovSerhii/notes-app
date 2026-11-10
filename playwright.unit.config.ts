import { defineConfig } from "@playwright/test";

/**
 * Unit tests for the pure logic in app/lib (reducer, storage, Markdown
 * transforms...). They reuse the Playwright runner, so the project needs one
 * test runner instead of two; no browser or dev server is started.
 */
export default defineConfig({
  testDir: "./app",
  testMatch: "**/*.test.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
});
