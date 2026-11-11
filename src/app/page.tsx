"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { historyRecorder, useNotes } from "@/features/notes/state/useNotes";
import { useSync } from "@/features/sync/client/useSync";
import { useImport } from "@/features/transfer/useImport";
import { useMediaQuery } from "@/shared/hooks/useMediaQuery";
import Sidebar from "@/features/library/Sidebar";
import LibraryNav, { type LibraryFilter } from "@/features/library/LibraryNav";
import Editor from "@/features/editor/Editor";
import NoteMeta from "@/features/editor/NoteMeta";
import Preview from "@/features/markdown/Preview";
import ExportMenu from "@/features/transfer/ExportMenu";
import ViewModeToggle, { type ViewMode } from "@/features/editor/ViewModeToggle";
import AppMenu from "@/features/workspace/AppMenu";
import DropOverlay from "@/features/transfer/DropOverlay";
import SyncButton from "@/features/sync/client/SyncButton";
import SyncDialog from "@/features/sync/client/SyncDialog";
import Button from "@/shared/ui/Button";
import Icon from "@/shared/ui/Icon";
import Toast, { type ToastMessage } from "@/shared/ui/Toast";
import { collectTags, filterNotes, sortNotes, type SortMode } from "@/features/notes/model/reducer";
import { usePreference } from "@/shared/hooks/usePreference";
import { backupFileName, createBackup } from "@/features/transfer/importExport";
import { downloadText } from "@/shared/lib/download";
import type { NoteTemplate } from "@/features/editor/lib/templates";
import { cn } from "@/shared/lib/cn";
import { trashLabel } from "@/features/library/NoteItem";
import type { Note } from "@/features/notes/model/types";
import { setLocale, useI18n } from "@/shared/i18n";
import CommandPalette, { type PaletteCommand } from "@/features/palette/CommandPalette";
import { type ExportActions } from "@/features/transfer/ExportMenu";
import { useTheme } from "@/features/theme/ThemeController";
import Backlinks from "@/features/markdown/Backlinks";
import HistoryDialog from "@/features/history/HistoryDialog";
import { WikiLinkContext, type WikiLinkTarget } from "@/features/markdown/wikiLinkContext";
import { backlinks, findNoteByTitle } from "@/features/markdown/lib/wikiLinks";

const isSortMode = (v: unknown): v is SortMode => v === "edited" || v === "created" || v === "title";

/** edit → split → preview → edit; split is skipped on narrow screens. */
function nextViewMode(mode: ViewMode, allowSplit: boolean): ViewMode {
  if (mode === "edit") return allowSplit ? "split" : "preview";
  return mode === "split" ? "preview" : "edit";
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

export default function Home() {
  const { t, count, locale } = useI18n();
  const { notes, trash, folders, activeNote, hydrated, saveStatus, store } = useNotes();
  const sync = useSync();

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>({ folderId: null, tag: null, trash: false });
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<Note | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const exportRef = useRef<ExportActions>(null);
  const [, setTheme] = useTheme();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const isDesktop = useMediaQuery("(min-width: 768px)", true);
  const isWide = useMediaQuery("(min-width: 1024px)", true);
  const effectiveMode: ViewMode = !isWide && viewMode === "split" ? "edit" : viewMode;

  // A folder or tag can disappear (deleted here or on another device).
  const activeFilter: LibraryFilter = useMemo(
    () => ({
      folderId: folders.some((f) => f.id === filter.folderId) ? filter.folderId : null,
      tag: notes.some((n) => filter.tag && n.tags.includes(filter.tag)) ? filter.tag : null,
      trash: filter.trash,
    }),
    [filter, folders, notes]
  );

  const [sortMode, setSortMode] = usePreference<SortMode>("notevoid-sort", "edited", isSortMode);
  const visibleNotes = useMemo(
    () =>
      activeFilter.trash
        ? filterNotes(trash, { query: searchQuery }) // the trash keeps deletion order
        : sortNotes(filterNotes(notes, { query: searchQuery, ...activeFilter }), sortMode),
    [notes, trash, searchQuery, activeFilter, sortMode]
  );
  const activeTrashed = activeNote?.trashedAt != null;
  const tags = useMemo(() => collectTags(notes), [notes]);
  const linkedFrom = useMemo(() => (activeNote ? backlinks(notes, activeNote) : []), [notes, activeNote]);
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes) if (n.folderId) counts.set(n.folderId, (counts.get(n.folderId) ?? 0) + 1);
    return counts;
  }, [notes]);

  const currentFolder = folders.find((f) => f.id === activeFilter.folderId);
  const listTitle = activeFilter.trash
    ? searchQuery.trim()
      ? t.sidebar.searchInTrash
      : t.sidebar.trash
    : searchQuery.trim()
    ? t.sidebar.searchResults
    : [currentFolder?.name ?? t.sidebar.allNotes, activeFilter.tag && `#${activeFilter.tag}`]
        .filter(Boolean)
        .join(" · ");

  const showToast = useCallback((message: Omit<ToastMessage, "id">) => {
    setToast({ ...message, id: Date.now() });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const showError = useCallback(
    (text: string) => showToast({ text, tone: "error" }),
    [showToast]
  );
  const feedback = useMemo(
    () => ({ success: (text: string) => showToast({ text }), error: showError }),
    [showToast, showError]
  );
  // Tell the user when sync kept their overwritten text as a copy.
  const syncClient = sync.client;
  useEffect(() => {
    let seen = syncClient.getSnapshot().lastConflict?.at;
    return syncClient.subscribe(() => {
      const conflict = syncClient.getSnapshot().lastConflict;
      if (!conflict || conflict.at === seen) return;
      seen = conflict.at;
      const [first, ...rest] = conflict.titles;
      showToast({
        text: rest.length
          ? t.toast.conflictMany(count(conflict.titles.length, t.plural.notes))
          : t.toast.conflictOne(first),
      });
    });
  }, [syncClient, showToast, t, count]);

  const { importMarkdown, importBackup, importFiles } = useImport(
    store,
    activeFilter.folderId,
    feedback
  );

  const handleCreate = useCallback(() => {
    store.create({
      folderId: activeFilter.folderId,
      tags: activeFilter.tag ? [activeFilter.tag] : [],
    });
    setSearchQuery("");
    setFilter((f) => (f.trash ? { ...f, trash: false } : f));
    setDrawerOpen(false);
    if (viewMode === "preview") setViewMode("split");
    requestAnimationFrame(() => titleRef.current?.select());
  }, [store, activeFilter, viewMode]);

  const handleSelect = useCallback(
    (id: string) => {
      store.select(id);
      setDrawerOpen(false);
    },
    [store]
  );

  // [[Title]] links in the preview open that note, or create it.
  const wikiTarget = useMemo<WikiLinkTarget>(
    () => ({
      exists: (title) => findNoteByTitle(notes, title) !== null,
      open: (title) => {
        const found = findNoteByTitle(notes, title);
        if (found) store.select(found.id);
        else store.create({ title, folderId: activeFilter.folderId });
      },
    }),
    [notes, store, activeFilter.folderId]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const trashed = trash.find((n) => n.id === id);
      if (trashed) {
        store.purge(id);
        showToast({ text: t.toast.deletedForever(trashed.title.trim() || t.common.untitled) });
        return;
      }
      const note = notes.find((n) => n.id === id);
      store.remove(id);
      showToast({
        text: t.toast.movedToTrash(note?.title.trim() || t.common.untitled),
        action: { label: t.common.undo, onClick: store.undoDelete },
      });
    },
    [notes, trash, store, showToast, t]
  );

  const handleDropNote = (id: string, target: { folderId: string | null } | "trash") => {
    if (target === "trash") return handleDelete(id);
    const note = notes.find((n) => n.id === id);
    if (!note || note.folderId === target.folderId) return;
    store.update(id, { folderId: target.folderId });
    const folder = folders.find((f) => f.id === target.folderId);
    showToast({
      text: t.toast.movedToFolder(note.title.trim() || t.common.untitled, folder?.name ?? t.sidebar.allNotes),
    });
  };

  const handleRestore = useCallback(
    (id: string) => {
      const note = trash.find((n) => n.id === id);
      store.restore(id);
      showToast({ text: t.toast.restored(note?.title.trim() || t.common.untitled) });
    },
    [trash, store, showToast, t]
  );

  const handleEmptyTrash = () => {
    const n = trash.length;
    store.emptyTrash();
    showToast({ text: t.toast.deletedManyForever(count(n, t.plural.notes)) });
  };

  const changeFilter = (next: LibraryFilter) => {
    setFilter(next);
    // Leaving the trash: don't keep a trashed note open in the editor area.
    if (!next.trash && activeTrashed) {
      store.select(filterNotes(notes, next)[0]?.id ?? notes[0]?.id ?? null);
    }
  };

  const handleDeleteFolder = useCallback(
    (id: string) => {
      const folder = folders.find((f) => f.id === id);
      store.deleteFolder(id);
      showToast({ text: t.toast.folderDeleted(folder?.name ?? "") });
    },
    [folders, store, showToast, t]
  );

  const downloadBackup = () => {
    const backup = createBackup(store.getData());
    downloadText(backupFileName(), JSON.stringify(backup, null, 2), "application/json");
    showToast({ text: t.toast.backupDownloaded(count(backup.notes.length, t.plural.notes)) });
  };

  const applyTemplate = (template: NoteTemplate) => {
    if (!activeNote) return;
    const body = template.body();
    const content = activeNote.content ? `${activeNote.content}\n\n${body}` : body;
    const title =
      !activeNote.title.trim() || activeNote.title === "Untitled" || activeNote.title === t.common.untitled
        ? t.templates[template.id]
        : activeNote.title;
    store.update(activeNote.id, { content, title });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyN") {
        e.preventDefault();
        handleCreate();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        ((e.shiftKey && e.code === "KeyP") || (!e.shiftKey && e.code === "KeyK" && !isEditableTarget(e.target)))
      ) {
        // Ctrl+K inside the editor inserts a link, so there it needs Shift+P.
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "/" && !isEditableTarget(e.target)) {
        e.preventDefault();
        setDrawerOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === "Escape" && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCreate, drawerOpen]);

  const commands: PaletteCommand[] = [
    { id: "new", label: t.palette.newNote, icon: "plus", run: handleCreate },
    {
      id: "search",
      label: t.palette.search,
      icon: "search",
      run: () => {
        setDrawerOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      },
    },
    ...(activeNote && !activeTrashed
      ? ([
          {
            id: "view",
            label: t.palette.toggleView,
            icon: "columns",
            run: () => setViewMode(nextViewMode(effectiveMode, isWide)),
          },
          { id: "history", label: t.palette.history, icon: "history", run: () => setHistoryFor(activeNote) },
          { id: "pdf", label: t.palette.exportPdf, icon: "download", run: () => exportRef.current?.exportPdf() },
          { id: "md", label: t.palette.exportMarkdown, icon: "fileText", run: () => exportRef.current?.exportMarkdown() },
        ] satisfies PaletteCommand[])
      : []),
    { id: "backup", label: t.palette.backup, icon: "database", run: downloadBackup },
    { id: "sync", label: t.palette.sync, icon: "cloud", run: () => setSyncOpen(true) },
    { id: "trash", label: t.palette.trash, icon: "trash", run: () => changeFilter({ folderId: null, tag: null, trash: true }) },
    { id: "light", label: t.palette.themeLight, icon: "eye", run: () => setTheme("light") },
    { id: "dark", label: t.palette.themeDark, icon: "eye", run: () => setTheme("dark") },
    { id: "system", label: t.palette.themeSystem, icon: "eye", run: () => setTheme("system") },
    { id: "language", label: t.palette.language, icon: "more", run: () => setLocale(locale === "uk" ? "en" : "uk") },
  ];

  const sidebar = (
    <Sidebar
      notes={visibleNotes}
      listTitle={listTitle}
      activeId={activeNote?.id ?? null}
      searchQuery={searchQuery}
      searchRef={searchRef}
      emptyMessage={
        activeFilter.trash && !searchQuery
          ? t.sidebar.trashEmpty
          : searchQuery || activeFilter.folderId || activeFilter.tag
            ? t.sidebar.noMatch
            : t.sidebar.noNotes
      }
      listAction={
        activeFilter.trash && trash.length > 0 ? (
          <EmptyTrashButton onConfirm={handleEmptyTrash} />
        ) : undefined
      }
      library={
        <LibraryNav
          folders={folders}
          folderCounts={folderCounts}
          tags={tags}
          totalCount={notes.length}
          trashCount={trash.length}
          filter={activeFilter}
          onFilterChange={changeFilter}
          onCreateFolder={(name) => {
            const folder = store.createFolder(name);
            if (folder) setFilter((f) => ({ ...f, folderId: folder.id }));
          }}
          onRenameFolder={store.renameFolder}
          onDeleteFolder={handleDeleteFolder}
          onDropNote={handleDropNote}
        />
      }
      onSearchChange={setSearchQuery}
      onSelect={handleSelect}
      onDelete={handleDelete}
      onTogglePin={store.togglePin}
      onRestore={handleRestore}
      onCreate={handleCreate}
      sortMode={activeFilter.trash ? undefined : sortMode}
      onSortChange={setSortMode}
    />
  );

  return (
    <div className="relative z-2 flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-bg-surface/45 px-3 py-2.5 sm:gap-3 sm:px-5">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t.header.openList}
          className="rounded-md p-1.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary md:hidden"
        >
          <Icon name="menu" size={20} />
        </button>
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">
          Note<span className="text-accent">Void</span>
        </h1>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {activeNote && !activeTrashed && (
            <ViewModeToggle
              value={effectiveMode}
              onChange={setViewMode}
              allowSplit={isWide}
            />
          )}
          <SyncButton sync={sync} onClick={() => setSyncOpen(true)} />
          <AppMenu
            onImportMarkdown={importMarkdown}
            onImportBackup={importBackup}
            onDownloadBackup={downloadBackup}
            onOpenSync={() => setSyncOpen(true)}
          />
          <ExportMenu
            title={activeNote?.title}
            content={activeNote?.content ?? ""}
            disabled={!activeNote}
            onError={showError}
            ref={exportRef}
          />
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        {isDesktop ? (
          sidebar
        ) : (
          <div
            className={cn(
              "fixed inset-0 z-40 transition-[visibility] duration-200",
              drawerOpen ? "visible" : "invisible"
            )}
            aria-hidden={!drawerOpen}
            inert={!drawerOpen}
          >
            <div
              className={cn(
                "absolute inset-0 bg-black/60 transition-opacity duration-200",
                drawerOpen ? "opacity-100" : "opacity-0"
              )}
              onClick={() => setDrawerOpen(false)}
            />
            <div
              className={cn(
                "relative h-full w-fit bg-bg-surface shadow-2xl transition-transform duration-200",
                drawerOpen ? "translate-x-0" : "-translate-x-full"
              )}
            >
              {sidebar}
            </div>
          </div>
        )}

        {!hydrated ? (
          <WorkspaceSkeleton />
        ) : activeNote && activeTrashed ? (
          <TrashedNote
            note={activeNote}
            onRestore={() => handleRestore(activeNote.id)}
            onDelete={() => handleDelete(activeNote.id)}
          />
        ) : activeNote ? (
          <>
            {effectiveMode !== "preview" && (
              <section
                aria-label={t.editor.label}
                className={cn(
                  "flex min-w-0 flex-1 flex-col bg-bg-surface/35",
                  effectiveMode === "split" && "border-r border-border"
                )}
              >
                <input
                  ref={titleRef}
                  type="text"
                  value={activeNote.title}
                  onChange={(e) => store.update(activeNote.id, { title: e.target.value })}
                  placeholder={t.common.untitled}
                  aria-label={t.note.title}
                  className="border-b border-border bg-transparent px-4 py-3 text-base font-semibold text-text-primary placeholder:text-text-muted outline-none sm:px-6"
                />
                <NoteMeta
                  key={activeNote.id}
                  note={activeNote}
                  folders={folders}
                  allTags={tags.map((t) => t.tag)}
                  onChange={(patch) => store.update(activeNote.id, patch)}
                  onShowHistory={() => setHistoryFor(activeNote)}
                />
                <div className="min-h-0 flex-1">
                  <Editor
                    key={activeNote.id}
                    value={activeNote.content}
                    saveStatus={saveStatus}
                    onChange={(content) => store.update(activeNote.id, { content })}
                    onTemplate={applyTemplate}
                  />
                </div>
                <Backlinks notes={linkedFrom} onOpen={handleSelect} />
              </section>
            )}

            {effectiveMode !== "edit" && (
              <section className="flex min-w-0 flex-1 flex-col bg-bg-surface/35">
                <div className="min-h-0 flex-1">
                  <WikiLinkContext.Provider value={wikiTarget}>
                    <Preview content={activeNote.content} />
                  </WikiLinkContext.Provider>
                </div>
                {effectiveMode === "preview" && <Backlinks notes={linkedFrom} onOpen={handleSelect} />}
              </section>
            )}
          </>
        ) : (
          <EmptyState onCreate={handleCreate} />
        )}
      </main>

      <SyncDialog open={syncOpen} onClose={() => setSyncOpen(false)} sync={sync} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        notes={notes}
        commands={commands}
        onOpenNote={(id) => {
          changeFilter({ folderId: null, tag: null, trash: false });
          handleSelect(id);
        }}
      />
      <HistoryDialog
        note={historyFor}
        onClose={() => setHistoryFor(null)}
        onRestore={(version) => {
          const current = notes.find((n) => n.id === version.noteId);
          if (current) {
            // Keep what is being replaced, so the restore itself can be undone.
            void historyRecorder?.keep(current);
            store.update(current.id, { title: version.title, content: version.content });
            showToast({ text: t.toast.versionRestored });
          }
          setHistoryFor(null);
        }}
      />
      <DropOverlay onDrop={importFiles} />
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

function TrashedNote({
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
        <span className="min-w-0 flex-1 text-text-secondary">
          {t.note.inTrash(trashLabel(note.trashedAt!, i18n))}
        </span>
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

/** Asks for a second click before deleting every trashed note for good. */
function EmptyTrashButton({ onConfirm }: { onConfirm: () => void }) {
  const { t } = useI18n();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal transition-colors",
        "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
        armed ? "bg-red-500/20 text-red-300" : "text-text-muted hover:text-red-300"
      )}
    >
      {armed ? t.sidebar.emptyTrashConfirm : t.sidebar.emptyTrash}
    </button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-1 items-center justify-center bg-bg-surface/35 p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-bg-elevated text-accent">
          <Icon name="fileText" size={22} />
        </div>
        <h2 className="text-base text-text-primary">{t.empty.title}</h2>
        <p className="mt-1 text-sm text-text-muted">{t.empty.text}</p>
        <Button variant="primary" onClick={onCreate} className="mt-5">
          <Icon name="plus" strokeWidth={2.4} />
          {t.sidebar.newNote}
        </Button>
        <p className="mt-3 text-xs text-text-muted">
          {t.empty.orPress}{" "}
          <kbd className="rounded border border-border px-1.5 font-mono">Alt + N</kbd>
        </p>
      </div>
    </section>
  );
}

function WorkspaceSkeleton() {
  const { t } = useI18n();
  return (
    <section
      aria-label={t.editor.loading}
      aria-busy
      className="flex-1 animate-pulse space-y-3 bg-bg-surface/35 p-6"
    >
      <div className="h-6 w-1/3 rounded bg-bg-elevated" />
      <div className="h-4 w-2/3 rounded bg-bg-elevated" />
      <div className="h-4 w-1/2 rounded bg-bg-elevated" />
    </section>
  );
}
