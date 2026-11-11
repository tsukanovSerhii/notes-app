"use client";

import type { Note } from "@/app/types/note";
import Icon from "@/app/components/ui/Icon";
import { useI18n } from "@/app/lib/i18n";

/** The notes that link to the open one, as a row of buttons. */
export default function Backlinks({ notes, onOpen }: { notes: Note[]; onOpen: (id: string) => void }) {
  const { t } = useI18n();
  if (notes.length === 0) return null;
  return (
    <nav
      aria-label={t.note.backlinks}
      className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2 text-xs sm:px-6"
    >
      <span className="flex items-center gap-1 text-text-muted">
        <Icon name="link" size={12} />
        {t.note.backlinks}:
      </span>
      {notes.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onOpen(n.id)}
          className="rounded-full border border-border px-2 py-0.5 text-text-secondary transition-colors hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
        >
          {n.title.trim() || t.common.untitled}
        </button>
      ))}
    </nav>
  );
}
