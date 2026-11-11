"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, unknown>();

function read<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
  if (cache.has(key)) return cache.get(key) as T;
  let value: T = fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null && valid(raw)) value = raw;
  } catch {
    // Blocked storage: keep the default.
  }
  cache.set(key, value);
  return value;
}

/**
 * A small per-device setting kept in localStorage (sort order, theme).
 * The server renders the default; the stored value applies after hydration,
 * without a mismatch.
 */
export function usePreference<T extends string>(
  key: string,
  fallback: T,
  valid: (v: unknown) => v is T
): [T, (value: T) => void] {
  const subscribe = useCallback((l: () => void) => {
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    set.add(l);
    return () => set.delete(l);
  }, [key]);
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback, valid),
    () => fallback
  );
  const update = useCallback(
    (next: T) => {
      cache.set(key, next);
      try {
        localStorage.setItem(key, next);
      } catch {}
      listeners.get(key)?.forEach((l) => l());
    },
    [key]
  );
  return [value, update];
}
