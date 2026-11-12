/**
 * Lighthouse CI: audits the production build and fails on regressions.
 * Run locally with `npm run build && npm run lighthouse` (set CHROME_PATH if
 * Chrome is not found).
 */
module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run start -- --port 3000",
      startServerReadyPattern: "Ready",
      startServerReadyTimeout: 60000,
      url: ["http://localhost:3000/"],
      numberOfRuns: 3,
      settings: {
        preset: "desktop",
        chromeFlags: "--no-sandbox --headless=new",
      },
    },
    assert: {
      // Margins sit well below the scores measured locally (all categories
      // 99-100, LCP 1.0 s, 365 KiB of scripts), since CI machines are slower.
      assertions: {
        "categories:performance": ["error", { minScore: 0.9, aggregationMethod: "median-run" }],
        "categories:accessibility": ["error", { minScore: 0.95, aggregationMethod: "median-run" }],
        "categories:best-practices": ["error", { minScore: 0.95, aggregationMethod: "median-run" }],
        "categories:seo": ["error", { minScore: 0.95, aggregationMethod: "median-run" }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500, aggregationMethod: "median" }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1, aggregationMethod: "median" }],
        "total-blocking-time": ["error", { maxNumericValue: 300, aggregationMethod: "median" }],
        // JavaScript budget, in bytes transferred. KaTeX, Mermaid and the Vim
        // keys load on demand, so they do not count against the first load.
        // CodeMirror (the editor) is about 130 KiB of the total.
        "resource-summary:script:size": ["error", { maxNumericValue: 400 * 1024 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
