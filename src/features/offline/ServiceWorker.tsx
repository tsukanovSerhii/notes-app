"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker in production builds. In development
 * it removes any worker left by a production run, so stale cached code never
 * shadows the dev server.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const registration = await navigator.serviceWorker.ready;
        if (cancelled) return;
        // Chunks loaded before the worker took control never passed through
        // it; hand their URLs over so the first visit is complete offline.
        const urls = performance
          .getEntriesByType("resource")
          .map((entry) => new URL(entry.name))
          .filter((url) => url.origin === location.origin && url.pathname.startsWith("/_next/static/"))
          .map((url) => url.pathname + url.search);
        registration.active?.postMessage({ type: "CACHE_URLS", urls });
      } catch {
        // Offline support is an enhancement; the app works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
