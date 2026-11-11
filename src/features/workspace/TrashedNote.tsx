"use client";

import type { Note } from "@/features/notes/model/types";
import { trashLabel } from "@/features/library/NoteItem";
import Preview from "@/features/markdown/Preview";
import Button from "@/shared/ui/Button";
import Icon from "@/shared/ui/Icon";
import { useI18n } from "@/shared/i18n";

/** A trashed note, read-only, with the way back. */
export default function TrashedNote({
  note,
  onRestore,
  onDelete,
}: {
  note: Note;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <section aria-label={t.note.inTrashRegion} className="flex min-w-0 flex-1 flex-col bg-bg-surface/35">
      <div
        role="status"
        className="flex flex-wrap items-center gap-3 border-b border-border bg-bg-elevated/60 px-4 py-3 text-sm sm:px-6"
      >
        <Icon name="trash" size={16} className="text-text-muted" />
        <span className="min-w-0 flex-1 text-text-secondary">{t.note.inTrash(trashLabel(note.trashedAt!, i18n))}</span>
        <Button variant="primary" onClick={onRestore}>
          <Icon name="restore" />
          {t.note.restoreButton}
        </Button>
        <Button onClick={onDelete} className="hover:text-red-400">
          {t.note.deleteForever}
        </Button>
      </div>
      <h2 className="border-b border-border px-4 py-3 text-base font-semibold text-text-primary sm:px-6">
        {note.title.trim() || t.common.untitled}
      </h2>
      <div className="min-h-0 flex-1">
        <Preview content={note.content} />
      </div>
    </section>
  );
}
