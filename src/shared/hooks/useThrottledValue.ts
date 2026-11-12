"use client";

import { useEffect, useRef, useState } from "react";

/**
 * `value`, but changing at most once per `ms`: the first change after a quiet
 * moment goes through at once, the ones that follow are held back and only the
 * latest is applied when the time is up. For work that follows typing but must
 * not run on every keystroke, such as redrawing a preview.
 */
export function useThrottledValue<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  const lastApplied = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Object.is(shown, value)) return;
    const wait = ms - (Date.now() - lastApplied.current);
    const apply = () => {
      lastApplied.current = Date.now();
      timer.current = null;
      setShown(value);
    };
    if (wait <= 0) {
      apply();
      return;
    }
    timer.current = setTimeout(apply, wait);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [value, shown, ms]);

  return shown;
}
