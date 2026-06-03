"use client";

import type { Note } from "@/app/types/note";
import { cn } from "@/app/lib/cn";

interface NoteItemProps {
  note: Note;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export default function NoteItem({
  note,
  active,
  onSelect,
  onDelete,
}: NoteItemProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative cursor-pointer rounded-md border-l-2 px-3 py-2.5 transition-colors",
        active
          ? "border-accent bg-accent-glow"
          : "border-transparent hover:bg-bg-elevated"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-sm font-medium",
              active ? "text-accent" : "text-text-primary"
            )}
          >
            {note.title || "Untitled"}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {relativeTime(note.updatedAt)}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label="Delete note"
          className="shrink-0 rounded p-1 text-text-muted opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} month${month === 1 ? "" : "s"} ago`;
  const year = Math.floor(month / 12);
  return `${year} year${year === 1 ? "" : "s"} ago`;
}
