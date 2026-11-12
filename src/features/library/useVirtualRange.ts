"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

export interface VirtualRange {
  /** First row to render. */
  start: number;
  /** One past the last row to render. */
  end: number;
}

const OVERSCAN = 8;
/** Rows drawn before the list has been measured. */
const FIRST_PAINT_ROWS = 16;

/**
 * Which rows of a long list of equal-height rows are on screen. The list sits
 * inside a scroll container together with other content, so its offset in the
 * container is measured rather than assumed. Re-measures on scroll (one frame
 * at a time), on resize and when the number of rows changes.
 */
export function useVirtualRange({
  count,
  rowHeight,
  scrollRef,
  listRef,
  enabled,
}: {
  count: number;
  rowHeight: number;
  scrollRef: RefObject<HTMLElement | null>;
  listRef: RefObject<HTMLElement | null>;
  enabled: boolean;
}): VirtualRange {
  const [range, setRange] = useState<VirtualRange>({ start: 0, end: FIRST_PAINT_ROWS });
  const frame = useRef(0);

  const measure = useCallback(() => {
    const scroller = scrollRef.current;
    const list = listRef.current;
    if (!scroller || !list) return;
    // Where the top of the list is relative to the top of the scroll area's viewport.
    const offset = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const first = Math.max(0, Math.floor(-offset / rowHeight) - OVERSCAN);
    const last = Math.min(count, Math.ceil((scroller.clientHeight - offset) / rowHeight) + OVERSCAN);
    setRange((prev) => (prev.start === first && prev.end === last ? prev : { start: first, end: Math.max(first, last) }));
  }, [count, rowHeight, scrollRef, listRef]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    measure();
    const onScroll = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        measure();
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onScroll);
    observer?.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      observer?.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [enabled, measure, scrollRef]);

  return enabled ? range : { start: 0, end: count };
}
