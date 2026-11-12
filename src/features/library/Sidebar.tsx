"use client";

import { useRef, type ReactNode, type Ref } from "react";
import type { Note } from "@/features/notes/model/types";
import type { SortMode } from "@/features/notes/model/reducer";
import SearchBar from "@/features/library/SearchBar";
import NoteItem, { NOTE_ROW_HEIGHT } from "@/features/library/NoteItem";
import { useVirtualRange } from "@/features/library/useVirtualRange";
import Button from "@/shared/ui/Button";
import Icon from "@/shared/ui/Icon";
import { useI18n } from "@/shared/i18n";

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
  onRestore: (id: string) => void;
  onCreate: () => void;
  /** Extra control next to the list title, e.g. "Empty trash". */
  listAction?: ReactNode;
  sortMode?: SortMode;
  onSortChange?: (mode: SortMode) => void;
}

/** Gap between rows (Tailwind space-y-1). */
const ROW_GAP = 4;
/** Below this many notes every row is simply rendered. */
export const VIRTUALIZE_ABOVE = 60;

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
  onRestore,
  onCreate,
  listAction,
  sortMode,
  onSortChange,
}: SidebarProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rowPitch = NOTE_ROW_HEIGHT + ROW_GAP;
  const windowed = notes.length > VIRTUALIZE_ABOVE;
  const { start, end } = useVirtualRange({
    count: notes.length,
    rowHeight: rowPitch,
    scrollRef,
    listRef,
    enabled: windowed,
  });
  const shown = windowed ? notes.slice(start, end) : notes;
  return (
    <aside
      aria-label={t.sidebar.notes}
      className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-bg-surface/95 md:w-64 md:bg-bg-surface/35"
    >
      <div className="space-y-3 px-3 pb-3 pt-4">
        <Button
          variant="primary"
          onClick={onCreate}
          className="w-full"
          title={t.sidebar.newNoteHint}
        >
          <Icon name="plus" strokeWidth={2.4} />
          {t.sidebar.newNote}
        </Button>
        <SearchBar ref={searchRef} value={searchQuery} onChange={onSearchChange} />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-3">
        {library}

        <h2 className="mb-1.5 flex items-center justify-between border-t border-border px-4 pt-3 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          <span className="truncate">{listTitle}</span>
          <span className="flex items-center gap-1.5">
            {listAction}
            {sortMode && onSortChange && (
              <select
                value={sortMode}
                onChange={(e) => onSortChange(e.target.value as SortMode)}
                aria-label={t.sidebar.sortBy}
                title={t.sidebar.sortBy}
                className="cursor-pointer rounded bg-transparent text-[10px] font-medium normal-case tracking-normal text-text-muted outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <option value="edited" className="bg-bg-elevated">{t.sidebar.sortEdited}</option>
                <option value="created" className="bg-bg-elevated">{t.sidebar.sortCreated}</option>
                <option value="title" className="bg-bg-elevated">{t.sidebar.sortTitle}</option>
              </select>
            )}
            <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal">
              {notes.length}
            </span>
          </span>
        </h2>

        {notes.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-text-muted">{emptyMessage}</p>
        ) : (
          <ul
            ref={listRef}
            aria-label={t.sidebar.noteList}
            className="space-y-1 px-2"
            // Rows outside the window are replaced by padding of the same height.
            style={windowed ? { paddingTop: start * rowPitch, paddingBottom: (notes.length - end) * rowPitch } : undefined}
          >
            {shown.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                active={note.id === activeId}
                onSelect={onSelect}
                onDelete={onDelete}
                onTogglePin={onTogglePin}
                onRestore={onRestore}
                query={searchQuery}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
