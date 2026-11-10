"use client";

import { memo } from "react";
import type { Note } from "@/app/types/note";
import Icon from "@/app/components/ui/Icon";
import { cn } from "@/app/lib/cn";
import { excerpt, relativeTime } from "@/app/lib/text";

interface NoteItemProps {
  note: Note;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}

function NoteItem({
  note,
  active,
  onSelect,
  onDelete,
  onTogglePin,
}: NoteItemProps) {
  const title = note.title.trim() || "Untitled";
  const preview = excerpt(note.content, 80, title);

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
          <span className="truncate">{title}</span>
        </span>
        {preview && (
          <span className="mt-0.5 block truncate text-xs text-text-muted">
            {preview}
          </span>
        )}
        <span className="mt-1 flex items-center gap-1.5 overflow-hidden text-[11px] text-text-muted/80">
          <time dateTime={new Date(note.updatedAt).toISOString()} className="shrink-0">
            {relativeTime(note.updatedAt)}
          </time>
          {note.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="truncate text-accent/80">
              #{tag}
            </span>
          ))}
        </span>
      </button>

      <div className="absolute right-1.5 top-2 flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <ItemAction
          label={note.pinned ? "Unpin note" : "Pin note"}
          onClick={() => onTogglePin(note.id)}
          className={note.pinned ? "text-accent" : undefined}
        >
          <Icon name="pin" size={14} />
        </ItemAction>
        <ItemAction
          label="Delete note"
          onClick={() => onDelete(note.id)}
          className="hover:text-red-400"
        >
          <Icon name="trash" size={14} />
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
