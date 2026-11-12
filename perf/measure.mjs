// Measures the app with a large library, against a running production server:
//
//   npm run build && npm run start -- --port 3100
//   node perf/measure.mjs            (or: PERF_URL=... PERF_NOTES=5000 node perf/measure.mjs)
//
// It seeds IndexedDB with synthetic notes (folders, tags, [[links]], ~1.5 KB of
// text each), reloads, and reports the time to a usable editor, typing and
// search latency, long tasks and DOM size. Numbers are for comparing builds on
// one machine, not absolute budgets.

import { chromium } from "playwright";

const URL_ = process.env.PERF_URL ?? "http://localhost:3100";
const COUNT = Number(process.env.PERF_NOTES ?? 3000);
const CPU_SLOWDOWN = Number(process.env.PERF_CPU ?? 4);

const WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua note plan idea review project draft meeting notes budget travel recipe garden".split(" ");
const rnd = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

function makeLibrary(count) {
  const r = rnd(42);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const folders = Array.from({ length: 24 }, (_, i) => ({
    id: `f${i}`,
    name: `Folder ${i}`,
    parentId: i >= 8 ? `f${i % 8}` : null,
    createdAt: 1000 + i,
    updatedAt: 1000 + i,
  }));
  const notes = Array.from({ length: count }, (_, i) => {
    const sentence = () => Array.from({ length: 8 + Math.floor(r() * 10) }, () => pick(WORDS)).join(" ");
    const paragraphs = Array.from({ length: 4 + Math.floor(r() * 4), }, () => Array.from({ length: 3 }, sentence).join(". ") + ".");
    const link = `[[Note ${Math.floor(r() * count)}]]`;
    const body = `# Note ${i}\n\n${paragraphs.join("\n\n")}\n\nSee ${link} and ${`[[Note ${Math.floor(r() * count)}]]`}.\n\n- [ ] ${sentence()}\n- [x] ${sentence()}\n`;
    const t = 1_700_000_000_000 + i * 60_000;
    return {
      id: `n${i}`,
      title: `Note ${i}`,
      content: body,
      pinned: i % 97 === 0,
      tags: [pick(["work", "home", "idea", "plan", "travel"]), ...(r() < 0.3 ? [pick(["urgent", "later"])] : [])],
      folderId: r() < 0.85 ? `f${Math.floor(r() * 24)}` : null,
      createdAt: t,
      updatedAt: t,
      editedAt: t,
      editedBy: null,
      trashedAt: null,
      conflictOf: null,
    };
  });
  return { folders, notes };
}

const browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
const context = await browser.newContext({ viewport: { width: 1350, height: 940 } });
const page = await context.newPage();

// First visit creates the database (and the welcome note); then it is replaced by the seed.
await page.goto(URL_);
await page.locator('[data-testid="editor"] .cm-content').waitFor();
const { folders, notes } = makeLibrary(COUNT);
await page.evaluate(
  async ({ folders, notes }) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("notevoid");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["notes", "meta"], "readwrite");
      const store = tx.objectStore("notes");
      store.clear();
      for (const n of notes) store.put(n);
      tx.objectStore("meta").put({ folders, tombstones: {}, activeId: notes[notes.length - 1].id }, "state");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem("notevoid-perf-seeded", "1");
  },
  { folders, notes }
);

const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

await page.addInitScript(() => {
  window.__perf = { longTasks: [], events: [] };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__perf.longTasks.push(Math.round(e.duration));
  }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__perf.events.push({ name: e.name, duration: e.duration });
  }).observe({ type: "event", durationThreshold: 16, buffered: true });
});

const t0 = Date.now();
await page.goto(URL_);
await page.locator('[data-testid="editor"] .cm-content').waitFor();
await page.getByRole("list", { name: "Note list" }).locator("li").first().waitFor();
const loadMs = Date.now() - t0;
const afterLoad = await page.evaluate(() => ({
  dom: document.querySelectorAll("*").length,
  rows: document.querySelectorAll('[aria-label="Note list"] li').length,
  heapMb: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
  longTasks: window.__perf.longTasks,
}));

const stats = (xs) => (xs.length ? { n: xs.length, max: Math.round(Math.max(...xs)), total: Math.round(xs.reduce((a, b) => a + b, 0)) } : { n: 0, max: 0, total: 0 });
const mark = () => page.evaluate(() => { window.__perf.longTasks.length = 0; window.__perf.events.length = 0; });
const collect = () => page.evaluate(() => ({ longTasks: window.__perf.longTasks.slice(), events: window.__perf.events.map((e) => e.duration) }));

// Typing in the open note.
await page.locator('[data-testid="editor"] .cm-content').click();
const PROFILE = process.env.PERF_PROFILE === "1";
if (PROFILE) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await cdp.send("Profiler.start");
}
await mark();
const typeStart = Date.now();
await page.keyboard.type("The quick brown fox jumps over the lazy dog. ", { delay: 0 });
await page.waitForTimeout(300);
const typed = await collect();
const typingMs = Date.now() - typeStart - 300;

if (PROFILE) {
  const { profile } = await cdp.send("Profiler.stop");
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => {
    const n = byId.get(id);
    const f = n.callFrame;
    const key = `${f.functionName || "(anonymous)"} ${f.url.split("/").slice(-1)[0]}:${f.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  console.error("--- typing profile: top self time (ms, share) ---");
  for (const [k, v] of top) console.error(`${(v / 1000).toFixed(0).padStart(7)} ms ${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
}

// Searching.
const search = page.getByRole("searchbox");
await mark();
const searchStart = Date.now();
await search.click();
await page.keyboard.type("lorem ipsum", { delay: 0 });
await page.waitForFunction(() => document.querySelectorAll('[aria-label="Note list"] li').length > 0);
await page.waitForTimeout(500);
const searched = await collect();
const searchMs = Date.now() - searchStart - 500;
await search.fill("");

// Switching to another note.
await mark();
const first = page.getByRole("list", { name: "Note list" }).locator("li").nth(3);
const switchStart = Date.now();
await first.click();
await page.locator("input[aria-label='Note title']").waitFor();
await page.waitForTimeout(300);
const switched = await collect();
const switchMs = Date.now() - switchStart - 300;

console.log(JSON.stringify({
  notes: COUNT,
  cpuSlowdown: CPU_SLOWDOWN,
  loadMs,
  afterLoad,
  typing: { ms: typingMs, chars: 45, longTasks: stats(typed.longTasks), eventDuration: stats(typed.events) },
  search: { ms: searchMs, longTasks: stats(searched.longTasks), eventDuration: stats(searched.events) },
  switchNote: { ms: switchMs, longTasks: stats(switched.longTasks), eventDuration: stats(switched.events) },
}, null, 2));

await browser.close();
