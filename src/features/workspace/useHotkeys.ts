"use client";

import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** App-wide shortcuts. Editor shortcuts (bold, link…) live in the editor. */
export function useHotkeys({
  newNote,
  openPalette,
  focusSearch,
  escape,
  escapeActive,
}: {
  newNote: () => void;
  openPalette: () => void;
  focusSearch: () => void;
  /** Escape; only called while `escapeActive`. */
  escape: () => void;
  escapeActive: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.altKey && !mod && e.code === "KeyN") {
        e.preventDefault();
        newNote();
      } else if (
        mod &&
        ((e.shiftKey && e.code === "KeyP") || (!e.shiftKey && e.code === "KeyK" && !isEditableTarget(e.target)))
      ) {
        // Ctrl+K inside the editor inserts a link, so there it needs Shift+P.
        e.preventDefault();
        openPalette();
      } else if (e.key === "/" && !isEditableTarget(e.target)) {
        e.preventDefault();
        focusSearch();
      } else if (e.key === "Escape" && escapeActive) {
        escape();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [newNote, openPalette, focusSearch, escape, escapeActive]);
}
