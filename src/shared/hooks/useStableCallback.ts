"use client";

import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * A function with a fixed identity that always calls the latest version of
 * `fn`. Handing these to memoized children keeps them from re-rendering just
 * because the parent made new closures, without the stale values a
 * dependency-free `useCallback` would capture.
 */
export function useStableCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  const latest = useRef(fn);
  // Updated after render, before any event can call it.
  useInsertionEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
