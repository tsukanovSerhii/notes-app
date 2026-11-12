"use client";

import { useRef, useState } from "react";
import { extractHeadings, type Heading } from "@/features/editor/lib/outline";
import Icon from "@/shared/ui/Icon";
import { useDismiss } from "@/shared/hooks/useDismiss";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n";

/** A menu of the note's headings; choosing one jumps to it. */
export default function Outline({ content, onJump }: { content: string; onJump: (heading: Heading) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const headings = open ? extractHeadings(content) : [];
  const shallowest = Math.min(...headings.map((h) => h.level), 6);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t.editor.outline}
        aria-label={t.editor.outline}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
          "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
          open ? "bg-accent-glow text-accent" : "text-text-primary/80 hover:bg-accent-glow hover:text-accent"
        )}
      >
        <Icon name="outline" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t.editor.outline}
          className="absolute left-0 top-9 z-30 max-h-72 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-bg-elevated p-1 shadow-xl"
        >
          {headings.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-text-muted">{t.editor.noHeadings}</p>
          ) : (
            headings.map((h) => (
              <button
                key={`${h.line}`}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onJump(h);
                }}
                style={{ paddingLeft: 8 + (h.level - shallowest) * 12 }}
                className="block w-full truncate rounded py-1.5 pr-2 text-left text-xs text-text-primary transition-colors hover:bg-accent-glow hover:text-accent focus-visible:bg-accent-glow focus-visible:outline-none"
              >
                {h.text}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
