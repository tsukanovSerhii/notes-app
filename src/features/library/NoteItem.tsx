"use client";

import { memo } from "react";
import type { Note } from "@/features/notes/model/types";
import Icon from "@/shared/ui/Icon";
import { cn } from "@/shared/lib/cn";
import { excerpt, highlight, relativeTime, searchSnippet } from "@/shared/lib/text";
import { TRASH_RETENTION_MS } from "@/features/notes/model/reducer";
import type { I18n } from "@/shared/i18n";
import { useI18n } from "@/shared/i18n";

interface NoteItemProps {
  note: Note;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onRestore: (id: string) => void;
  /** The active search, to highlight in the title and show text around a match. */
  query?: string;
}

/** The drag type of a note being moved inside the app (files use "Files"). */
export const NOTE_DRAG_TYPE = "application/x-notevoid-note";

/** Text with the parts that match `query` marked. */
function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((seg, i) =>
        seg.match ? (
          <mark key={i} className="rounded-sm bg-accent/25 px-px text-inherit">
            {seg.text}
          </mark>
        ) : (
          seg.text
        )
      )}
    </>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "deleted 3 days ago · 27 days left" */
export function trashLabel(trashedAt: number, i18n: I18n, now = Date.now()): string {
  const left = Math.max(0, Math.ceil((trashedAt + TRASH_RETENTION_MS - now) / DAY_MS));
  return i18n.t.note.trashLabel(
    relativeTime(trashedAt, now, i18n.locale),
    i18n.count(left, i18n.t.plural.days)
  );
}

function NoteItem({
  note,
  active,
  onSelect,
  onDelete,
  onTogglePin,
  onRestore,
  query = "",
}: NoteItemProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const title = note.title.trim() || t.common.untitled;
  // While searching, show where the text matched instead of how it starts.
  const preview = (query && searchSnippet(note.content, query)) || excerpt(note.content, 80, title);
  const trashed = note.trashedAt !== null;

  return (
    <li
      className={cn(
        "group relative rounded-md border-l-2 transition-colors",
        active
          ? "border-accent bg-accent-glow"
          : "border-transparent hover:bg-bg-elevated"
      )}
    >
      <button
        type="button"
        draggable={!trashed}
        onDragStart={(e) => {
          e.dataTransfer.setData(NOTE_DRAG_TYPE, note.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => onSelect(note.id)}
        aria-current={active ? "true" : undefined}
        className="block w-full rounded-md py-2.5 pl-3 pr-16 text-left focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
      >
        <span
          className={cn(
            "flex items-center gap-1.5 truncate text-sm font-medium",
            active ? "text-accent" : "text-text-primary"
          )}
        >
          {note.pinned && (
            <Icon name="pin" size={12} className="shrink-0 text-accent" />
          )}
          <span className="truncate">
            <Highlighted text={title} query={query} />
          </span>
        </span>
        {preview && (
          <span className="mt-0.5 block truncate text-xs text-text-muted">
            <Highlighted text={preview} query={query} />
          </span>
        )}
        <span className="mt-1 flex items-center gap-1.5 overflow-hidden text-[11px] text-text-muted/80">
          {trashed ? (
            <span className="shrink-0">{trashLabel(note.trashedAt!, i18n)}</span>
          ) : (
            <time dateTime={new Date(note.editedAt).toISOString()} className="shrink-0">
              {relativeTime(note.editedAt, undefined, i18n.locale)}
            </time>
          )}
          {note.conflictOf && (
            <span className="shrink-0 rounded bg-amber-400/15 px-1 text-amber-300">{t.note.conflictCopy}</span>
          )}
          {note.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="truncate text-accent/80">
              #{tag}
            </span>
          ))}
        </span>
      </button>

      <div className="absolute right-1.5 top-2 flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        {trashed ? (
          <ItemAction label={t.note.restore} onClick={() => onRestore(note.id)}>
            <Icon name="restore" size={14} />
          </ItemAction>
        ) : (
          <ItemAction
            label={note.pinned ? t.note.unpin : t.note.pin}
            onClick={() => onTogglePin(note.id)}
            className={note.pinned ? "text-accent" : undefined}
          >
            <Icon name="pin" size={14} />
          </ItemAction>
        )}
        <ItemAction
          label={trashed ? t.note.deleteForever : t.note.delete}
          onClick={() => onDelete(note.id)}
          className="hover:text-red-400"
        >
          <Icon name={trashed ? "x" : "trash"} size={14} />
        </ItemAction>
      </div>
    </li>
  );
}

function ItemAction({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "rounded p-1 text-text-muted transition-colors hover:bg-bg-base/60 hover:text-text-primary",
        "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
        className
      )}
    >
      {children}
    </button>
  );
}

export default memo(NoteItem);
