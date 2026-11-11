"use client";

import { useCallback, useRef, useState } from "react";
import type { Note } from "@/features/notes/model/types";
import { useNotes } from "@/features/notes/state/useNotes";
import Sidebar from "@/features/library/Sidebar";
import LibraryNav from "@/features/library/LibraryNav";
import EmptyTrashButton from "@/features/library/EmptyTrashButton";
import ViewModeToggle, { nextViewMode, type ViewMode } from "@/features/editor/ViewModeToggle";
import HistoryDialog from "@/features/history/HistoryDialog";
import { useSync } from "@/features/sync/client/useSync";
import SyncButton from "@/features/sync/client/SyncButton";
import SyncDialog from "@/features/sync/client/SyncDialog";
import { useImport } from "@/features/transfer/useImport";
import ExportMenu, { type ExportActions } from "@/features/transfer/ExportMenu";
import DropOverlay from "@/features/transfer/DropOverlay";
import CommandPalette from "@/features/palette/CommandPalette";
import { useTheme } from "@/features/theme/ThemeController";
import AppMenu from "@/features/workspace/AppMenu";
import Header from "@/features/workspace/Header";
import MobileDrawer from "@/features/workspace/MobileDrawer";
import NotePane from "@/features/workspace/NotePane";
import TrashedNote from "@/features/workspace/TrashedNote";
import { EmptyState, WorkspaceSkeleton } from "@/features/workspace/EmptyState";
import { ALL_NOTES, TRASH, useLibraryView } from "@/features/workspace/useLibraryView";
import { useNoteActions } from "@/features/workspace/useNoteActions";
import { useToast } from "@/features/workspace/useToast";
import { useHotkeys } from "@/features/workspace/useHotkeys";
import { useConflictToasts } from "@/features/workspace/useConflictToasts";
import { useCommands } from "@/features/workspace/useCommands";
import { useMediaQuery } from "@/shared/hooks/useMediaQuery";
import Toast from "@/shared/ui/Toast";

/**
 * The app shell. It owns the UI state that spans features (which note is
 * open how, which dialog is up) and wires the features together; the
 * features themselves own their logic.
 */
export default function Workspace() {
  const { notes, trash, folders, activeNote, hydrated, saveStatus, store } = useNotes();
  const sync = useSync();
  const [, setTheme] = useTheme();
  const { toast, showToast, dismissToast, showError, feedback } = useToast();
  const library = useLibraryView({ notes, trash, folders, activeNote, store });
  const actions = useNoteActions({ store, notes, trash, folders, activeNote, showToast });
  const { importMarkdown, importBackup, importFiles } = useImport(store, library.activeFilter.folderId, feedback);
  useConflictToasts(sync.client, showToast);

  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<Note | null>(null);
  const exportRef = useRef<ExportActions>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const isDesktop = useMediaQuery("(min-width: 768px)", true);
  const isWide = useMediaQuery("(min-width: 1024px)", true);
  const effectiveMode: ViewMode = !isWide && viewMode === "split" ? "edit" : viewMode;
  const activeTrashed = activeNote?.trashedAt != null;
  const { activeFilter, setSearchQuery, setFilter, changeFilter } = library;

  const newNote = useCallback(() => {
    store.create({ folderId: activeFilter.folderId, tags: activeFilter.tag ? [activeFilter.tag] : [] });
    setSearchQuery("");
    setFilter((f) => (f.trash ? { ...f, trash: false } : f));
    setDrawerOpen(false);
    if (viewMode === "preview") setViewMode("split");
    requestAnimationFrame(() => titleRef.current?.select());
  }, [store, activeFilter, viewMode, setSearchQuery, setFilter]);

  const openNote = useCallback(
    (id: string) => {
      store.select(id);
      setDrawerOpen(false);
    },
    [store]
  );

  const focusSearch = useCallback(() => {
    setDrawerOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  useHotkeys({
    newNote,
    openPalette: useCallback(() => setPaletteOpen(true), []),
    focusSearch,
    escape: useCallback(() => setDrawerOpen(false), []),
    escapeActive: drawerOpen,
  });

  const commands = useCommands({
    hasOpenNote: activeNote !== null && !activeTrashed,
    newNote,
    focusSearch,
    cycleViewMode: () => setViewMode(nextViewMode(effectiveMode, isWide)),
    showHistory: () => setHistoryFor(activeNote),
    exportPdf: () => exportRef.current?.exportPdf(),
    exportMarkdown: () => exportRef.current?.exportMarkdown(),
    downloadBackup: actions.downloadBackup,
    openSync: () => setSyncOpen(true),
    openTrash: () => changeFilter(TRASH),
    setTheme,
  });

  const sidebar = (
    <Sidebar
      notes={library.visibleNotes}
      listTitle={library.listTitle}
      activeId={activeNote?.id ?? null}
      searchQuery={library.searchQuery}
      searchRef={searchRef}
      emptyMessage={library.emptyMessage}
      listAction={
        activeFilter.trash && trash.length > 0 ? <EmptyTrashButton onConfirm={actions.emptyTrash} /> : undefined
      }
      library={
        <LibraryNav
          folders={folders}
          folderCounts={library.folderCounts}
          tags={library.tags}
          totalCount={notes.length}
          trashCount={trash.length}
          filter={activeFilter}
          onFilterChange={changeFilter}
          onCreateFolder={(name) => {
            const folder = store.createFolder(name);
            if (folder) setFilter((f) => ({ ...f, folderId: folder.id }));
          }}
          onRenameFolder={store.renameFolder}
          onDeleteFolder={actions.deleteFolder}
          onDropNote={actions.moveNote}
        />
      }
      onSearchChange={setSearchQuery}
      onSelect={openNote}
      onDelete={actions.remove}
      onTogglePin={store.togglePin}
      onRestore={actions.restore}
      onCreate={newNote}
      sortMode={activeFilter.trash ? undefined : library.sortMode}
      onSortChange={library.setSortMode}
    />
  );

  return (
    <div className="relative z-2 flex h-dvh flex-col">
      <Header onOpenDrawer={() => setDrawerOpen(true)}>
        {activeNote && !activeTrashed && (
          <ViewModeToggle value={effectiveMode} onChange={setViewMode} allowSplit={isWide} />
        )}
        <SyncButton sync={sync} onClick={() => setSyncOpen(true)} />
        <AppMenu
          onImportMarkdown={importMarkdown}
          onImportBackup={importBackup}
          onDownloadBackup={actions.downloadBackup}
          onOpenSync={() => setSyncOpen(true)}
        />
        <ExportMenu
          title={activeNote?.title}
          content={activeNote?.content ?? ""}
          disabled={!activeNote}
          onError={showError}
          ref={exportRef}
        />
      </Header>

      <main className="flex min-h-0 flex-1">
        {isDesktop ? (
          sidebar
        ) : (
          <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
            {sidebar}
          </MobileDrawer>
        )}

        {!hydrated ? (
          <WorkspaceSkeleton />
        ) : activeNote && activeTrashed ? (
          <TrashedNote
            note={activeNote}
            onRestore={() => actions.restore(activeNote.id)}
            onDelete={() => actions.remove(activeNote.id)}
          />
        ) : activeNote ? (
          <NotePane
            note={activeNote}
            notes={notes}
            folders={folders}
            allTags={library.tags.map((tag) => tag.tag)}
            mode={effectiveMode}
            saveStatus={saveStatus}
            store={store}
            folderForNewNotes={activeFilter.folderId}
            titleRef={titleRef}
            onOpen={openNote}
            onShowHistory={() => setHistoryFor(activeNote)}
            onTemplate={actions.applyTemplate}
            onRenamed={actions.renameLinks}
          />
        ) : (
          <EmptyState onCreate={newNote} />
        )}
      </main>

      <SyncDialog open={syncOpen} onClose={() => setSyncOpen(false)} sync={sync} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        notes={notes}
        commands={commands}
        onOpenNote={(id) => {
          changeFilter(ALL_NOTES);
          openNote(id);
        }}
      />
      <HistoryDialog
        note={historyFor}
        onClose={() => setHistoryFor(null)}
        onRestore={(version) => {
          actions.restoreVersion(version);
          setHistoryFor(null);
        }}
      />
      <DropOverlay onDrop={importFiles} />
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
