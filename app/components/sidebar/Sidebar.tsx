"use client";

// Sidebar — note list panel: header with "New note" action, a search bar,
// and a scrollable list of NoteItem rows.

import type { Note } from "@/app/types/note";
import SearchBar from "@/app/components/sidebar/SearchBar";
import NoteItem from "@/app/components/sidebar/NoteItem";
import Button from "@/app/components/ui/Button";

interface SidebarProps {
  notes: Note[];
  activeId: string | null;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}

export default function Sidebar({
  notes,
  activeId,
  searchQuery,
  onSearchChange,
  onSelect,
  onDelete,
  onCreate,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border">
      {/* Header */}
      <div className="px-4 pb-3 pt-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Notes
        </h2>
        <Button
          variant="primary"
          size="md"
          onClick={onCreate}
          className="w-full"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New note
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <SearchBar value={searchQuery} onChange={onSearchChange} />
      </div>

      {/* Note list */}
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {notes.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-text-muted">
            {searchQuery ? "No notes match your search." : "No notes yet."}
          </p>
        ) : (
          notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              active={note.id === activeId}
              onSelect={() => onSelect(note.id)}
              onDelete={() => onDelete(note.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
