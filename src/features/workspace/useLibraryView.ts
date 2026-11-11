"use client";

import { useMemo, useState } from "react";
import type { Folder, Note } from "@/features/notes/model/types";
import { collectTags, filterNotes, sortNotes, type SortMode } from "@/features/notes/model/reducer";
import type { NotesStore } from "@/features/notes/state/store";
import type { LibraryFilter } from "@/features/library/LibraryNav";
import { usePreference } from "@/shared/hooks/usePreference";
import { useI18n } from "@/shared/i18n";

const isSortMode = (v: unknown): v is SortMode => v === "edited" || v === "created" || v === "title";

export const ALL_NOTES: LibraryFilter = { folderId: null, tag: null, trash: false };
export const TRASH: LibraryFilter = { folderId: null, tag: null, trash: true };

/**
 * What the sidebar shows: the search, the folder/tag/trash filter and the
 * sort order, and the notes, counts and titles that follow from them.
 */
export function useLibraryView({
  notes,
  trash,
  folders,
  activeNote,
  store,
}: {
  notes: Note[];
  trash: Note[];
  folders: Folder[];
  activeNote: Note | null;
  store: NotesStore;
}) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>(ALL_NOTES);
  const [sortMode, setSortMode] = usePreference<SortMode>("notevoid-sort", "edited", isSortMode);

  // A folder or tag can disappear (deleted here or on another device).
  const activeFilter: LibraryFilter = useMemo(
    () => ({
      folderId: folders.some((f) => f.id === filter.folderId) ? filter.folderId : null,
      tag: notes.some((n) => filter.tag && n.tags.includes(filter.tag)) ? filter.tag : null,
      trash: filter.trash,
    }),
    [filter, folders, notes]
  );

  const visibleNotes = useMemo(
    () =>
      activeFilter.trash
        ? filterNotes(trash, { query: searchQuery }) // the trash keeps deletion order
        : sortNotes(filterNotes(notes, { query: searchQuery, ...activeFilter }), sortMode),
    [notes, trash, searchQuery, activeFilter, sortMode]
  );
  const tags = useMemo(() => collectTags(notes), [notes]);
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes) if (n.folderId) counts.set(n.folderId, (counts.get(n.folderId) ?? 0) + 1);
    return counts;
  }, [notes]);

  const currentFolder = folders.find((f) => f.id === activeFilter.folderId);
  const searching = searchQuery.trim() !== "";
  const listTitle = activeFilter.trash
    ? searching
      ? t.sidebar.searchInTrash
      : t.sidebar.trash
    : searching
      ? t.sidebar.searchResults
      : [currentFolder?.name ?? t.sidebar.allNotes, activeFilter.tag && `#${activeFilter.tag}`]
          .filter(Boolean)
          .join(" · ");
  const emptyMessage =
    activeFilter.trash && !searchQuery
      ? t.sidebar.trashEmpty
      : searchQuery || activeFilter.folderId || activeFilter.tag
        ? t.sidebar.noMatch
        : t.sidebar.noNotes;

  const changeFilter = (next: LibraryFilter) => {
    setFilter(next);
    // Leaving the trash: don't keep a trashed note open in the editor area.
    if (!next.trash && activeNote?.trashedAt != null) {
      store.select(filterNotes(notes, next)[0]?.id ?? notes[0]?.id ?? null);
    }
  };

  return {
    searchQuery,
    setSearchQuery,
    activeFilter,
    setFilter,
    changeFilter,
    sortMode,
    setSortMode,
    visibleNotes,
    tags,
    folderCounts,
    listTitle,
    emptyMessage,
  };
}

export type LibraryView = ReturnType<typeof useLibraryView>;
