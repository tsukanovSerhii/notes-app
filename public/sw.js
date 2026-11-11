/*
 * NoteVoid service worker: makes the app shell available offline.
 * Notes themselves live in IndexedDB; this only caches the code that reads them.
 *
 *   navigations      network first (3 s timeout), falling back to the cached page
 *   /_next/static/*  cache first (file names are content hashes, so immutable)
 *   other same-origin GETs (icons, manifest)  stale-while-revalidate
 *   /api/*, other origins, non-GET  not touched
 */

const VERSION = "v1";
const PAGE_CACHE = `notevoid-page-${VERSION}`;
const ASSET_CACHE = `notevoid-assets-${VERSION}`;
const ASSET_LIMIT = 300;
const NETWORK_TIMEOUT_MS = 3000;
const SHELL = "/";

const STATIC_RE = /\/_next\/static\/[^"'\s)\\]+/g;

self.addEventListener("install", (event) => {
  event.waitUntil(precache().finally(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGE_CACHE, ASSET_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith("notevoid-") && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

/** Caches the page and every static asset it references. */
async function precache() {
  try {
    const response = await fetch(SHELL, { cache: "no-store" });
    if (!response.ok) return;
    const html = await response.clone().text();
    await (await caches.open(PAGE_CACHE)).put(SHELL, response);
    const urls = new Set(html.match(STATIC_RE) ?? []);
    for (const extra of ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon.svg"]) urls.add(extra);
    await cacheUrls([...urls]);
  } catch {
    // Offline during install: the runtime handlers fill the cache later.
  }
}

async function cacheUrls(urls) {
  const cache = await caches.open(ASSET_CACHE);
  await Promise.all(
    urls.map(async (url) => {
      if (await cache.match(url)) return;
      try {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch {}
    })
  );
  await trim(cache);
}

/** Keeps the asset cache bounded; old deploys' chunks go first. */
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - ASSET_LIMIT; i++) await cache.delete(keys[i]);
}

// The page reports the chunks it loaded before this worker took control.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type !== "CACHE_URLS" || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => typeof u === "string" && u.startsWith("/_next/static/"));
  event.waitUntil(cacheUrls(urls));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

async function navigate(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok && new URL(request.url).pathname === SHELL) {
      await cache.put(SHELL, response.clone());
    }
    return response;
  } catch {
    // This is a single-page app, so the shell serves any path offline.
    const cached = await cache.match(SHELL);
    if (cached) return cached;
    return new Response("NoteVoid is offline and has not been cached yet.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cache);
  }
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached ?? Response.error());
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return refresh;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
