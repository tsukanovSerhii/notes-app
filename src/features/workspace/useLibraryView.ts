"use client";

import { useMemo, useState } from "react";
import type { Folder, Note } from "@/features/notes/model/types";
import { collectTags, filterNotes, sortNotes, type SortMode } from "@/features/notes/model/reducer";
import type { NotesStore } from "@/features/notes/state/store";
import type { LibraryFilter } from "@/features/library/LibraryNav";
import { useNoteSearch } from "@/features/library/search/useNoteSearch";
import { folderNoteCounts, folderWithDescendants } from "@/features/notes/model/folders";
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

  // A folder shows the notes of its subfolders too.
  const folderIds = useMemo(
    () => (activeFilter.folderId ? folderWithDescendants(folders, activeFilter.folderId) : null),
    [folders, activeFilter.folderId]
  );

  // Ranked results from the search worker; null until it has answered.
  const ranked = useNoteSearch(notes, activeFilter.trash ? "" : searchQuery);
  const visibleNotes = useMemo(() => {
    if (activeFilter.trash) return filterNotes(trash, { query: searchQuery }); // the trash keeps deletion order
    if (ranked) {
      // Best match first, still narrowed by the folder and tag filter.
      const byId = new Map(notes.map((n) => [n.id, n]));
      const hits = ranked.flatMap((id) => byId.get(id) ?? []);
      return filterNotes(hits, { folderIds, tag: activeFilter.tag });
    }
    const filtered = filterNotes(notes, { query: searchQuery, folderIds, tag: activeFilter.tag });
    // `notes` is already sorted by last edit (pinned first), the default; sorting again would repeat that work on every keystroke.
    return sortMode === "edited" ? filtered : sortNotes(filtered, sortMode);
  }, [notes, trash, searchQuery, activeFilter, folderIds, sortMode, ranked]);
  const tags = useMemo(() => collectTags(notes), [notes]);
  // Counts include subfolders, matching what selecting the folder shows.
  const folderCounts = useMemo(() => folderNoteCounts(folders, notes), [folders, notes]);

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
