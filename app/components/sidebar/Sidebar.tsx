"use client";

import type { ReactNode, Ref } from "react";
import type { Note } from "@/app/types/note";
import SearchBar from "@/app/components/sidebar/SearchBar";
import NoteItem from "@/app/components/sidebar/NoteItem";
import Button from "@/app/components/ui/Button";
import Icon from "@/app/components/ui/Icon";

interface SidebarProps {
  notes: Note[];
  listTitle: string;
  activeId: string | null;
  searchQuery: string;
  searchRef?: Ref<HTMLInputElement>;
  library: ReactNode;
  emptyMessage: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onCreate: () => void;
}

export default function Sidebar({
  notes,
  listTitle,
  activeId,
  searchQuery,
  searchRef,
  library,
  emptyMessage,
  onSearchChange,
  onSelect,
  onDelete,
  onTogglePin,
  onCreate,
}: SidebarProps) {
  return (
    <aside
      aria-label="Notes"
      className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-bg-surface/95 md:w-64 md:bg-bg-surface/35"
    >
      <div className="space-y-3 px-3 pb-3 pt-4">
        <Button
          variant="primary"
          onClick={onCreate}
          className="w-full"
          title="New note (Alt+N)"
        >
          <Icon name="plus" strokeWidth={2.4} />
          New note
        </Button>
        <SearchBar ref={searchRef} value={searchQuery} onChange={onSearchChange} />
      </div>

      <div className="flex-1 overflow-y-auto pb-3">
        {library}

        <h2 className="mb-1.5 flex items-center justify-between border-t border-border px-4 pt-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          <span className="truncate">{listTitle}</span>
          <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal">
            {notes.length}
          </span>
        </h2>

        {notes.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-text-muted">{emptyMessage}</p>
        ) : (
          <ul aria-label="Note list" className="space-y-1 px-2">
            {notes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                active={note.id === activeId}
                onSelect={onSelect}
                onDelete={onDelete}
                onTogglePin={onTogglePin}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
