"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotes } from "@/app/hooks/useNotes";
import { useSync } from "@/app/hooks/useSync";
import { useImport } from "@/app/hooks/useImport";
import { useMediaQuery } from "@/app/hooks/useMediaQuery";
import Sidebar from "@/app/components/sidebar/Sidebar";
import LibraryNav, { type LibraryFilter } from "@/app/components/sidebar/LibraryNav";
import Editor from "@/app/components/editor/Editor";
import NoteMeta from "@/app/components/editor/NoteMeta";
import Preview from "@/app/components/editor/Preview";
import ExportMenu from "@/app/components/editor/ExportMenu";
import ViewModeToggle, { type ViewMode } from "@/app/components/editor/ViewModeToggle";
import AppMenu from "@/app/components/AppMenu";
import DropOverlay from "@/app/components/DropOverlay";
import SyncButton from "@/app/components/sync/SyncButton";
import SyncDialog from "@/app/components/sync/SyncDialog";
import Button from "@/app/components/ui/Button";
import Icon from "@/app/components/ui/Icon";
import Toast, { type ToastMessage } from "@/app/components/ui/Toast";
import { collectTags, filterNotes } from "@/app/lib/notes/reducer";
import { backupFileName, createBackup } from "@/app/lib/importExport";
import { downloadText } from "@/app/lib/download";
import type { NoteTemplate } from "@/app/lib/templates";
import { cn } from "@/app/lib/cn";

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

export default function Home() {
  const { notes, folders, activeNote, hydrated, saveStatus, store } = useNotes();
  const sync = useSync();

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>({ folderId: null, tag: null });
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
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
    }),
    [filter, folders, notes]
  );

  const visibleNotes = useMemo(
    () => filterNotes(notes, { query: searchQuery, ...activeFilter }),
    [notes, searchQuery, activeFilter]
  );
  const tags = useMemo(() => collectTags(notes), [notes]);
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes) if (n.folderId) counts.set(n.folderId, (counts.get(n.folderId) ?? 0) + 1);
    return counts;
  }, [notes]);

  const currentFolder = folders.find((f) => f.id === activeFilter.folderId);
  const listTitle = searchQuery.trim()
    ? "Search results"
    : [currentFolder?.name ?? "All notes", activeFilter.tag && `#${activeFilter.tag}`]
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

  const handleDelete = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id);
      store.remove(id);
      showToast({
        text: `Deleted “${note?.title.trim() || "Untitled"}”`,
        action: { label: "Undo", onClick: store.undoDelete },
      });
    },
    [notes, store, showToast]
  );

  const handleDeleteFolder = useCallback(
    (id: string) => {
      const folder = folders.find((f) => f.id === id);
      store.deleteFolder(id);
      showToast({ text: `Deleted folder “${folder?.name}”. Its notes were kept.` });
    },
    [folders, store, showToast]
  );

  const downloadBackup = () => {
    const backup = createBackup(store.getData());
    downloadText(backupFileName(), JSON.stringify(backup, null, 2), "application/json");
    showToast({ text: `Backup of ${backup.notes.length} notes downloaded` });
  };

  const applyTemplate = (template: NoteTemplate) => {
    if (!activeNote) return;
    const body = template.body();
    const content = activeNote.content ? `${activeNote.content}\n\n${body}` : body;
    const title =
      !activeNote.title.trim() || activeNote.title === "Untitled"
        ? template.title
        : activeNote.title;
    store.update(activeNote.id, { content, title });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyN") {
        e.preventDefault();
        handleCreate();
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

  const sidebar = (
    <Sidebar
      notes={visibleNotes}
      listTitle={listTitle}
      activeId={activeNote?.id ?? null}
      searchQuery={searchQuery}
      searchRef={searchRef}
      emptyMessage={
        searchQuery || activeFilter.folderId || activeFilter.tag
          ? "No notes match."
          : "No notes yet."
      }
      library={
        <LibraryNav
          folders={folders}
          folderCounts={folderCounts}
          tags={tags}
          totalCount={notes.length}
          filter={activeFilter}
          onFilterChange={setFilter}
          onCreateFolder={(name) => {
            const folder = store.createFolder(name);
            if (folder) setFilter((f) => ({ ...f, folderId: folder.id }));
          }}
          onRenameFolder={store.renameFolder}
          onDeleteFolder={handleDeleteFolder}
        />
      }
      onSearchChange={setSearchQuery}
      onSelect={handleSelect}
      onDelete={handleDelete}
      onTogglePin={store.togglePin}
      onCreate={handleCreate}
    />
  );

  return (
    <div className="relative z-2 flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-bg-surface/45 px-3 py-2.5 sm:gap-3 sm:px-5">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open notes list"
          className="rounded-md p-1.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary md:hidden"
        >
          <Icon name="menu" size={20} />
        </button>
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">
          Note<span className="text-accent">Void</span>
        </h1>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {activeNote && (
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
        ) : activeNote ? (
          <>
            {effectiveMode !== "preview" && (
              <section
                aria-label="Editor"
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
                  placeholder="Untitled"
                  aria-label="Note title"
                  className="border-b border-border bg-transparent px-4 py-3 text-base font-semibold text-text-primary placeholder:text-text-muted outline-none sm:px-6"
                />
                <NoteMeta
                  key={activeNote.id}
                  note={activeNote}
                  folders={folders}
                  allTags={tags.map((t) => t.tag)}
                  onChange={(patch) => store.update(activeNote.id, patch)}
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
              </section>
            )}

            {effectiveMode !== "edit" && (
              <section className="min-w-0 flex-1 bg-bg-surface/35">
                <Preview content={activeNote.content} />
              </section>
            )}
          </>
        ) : (
          <EmptyState onCreate={handleCreate} />
        )}
      </main>

      <SyncDialog open={syncOpen} onClose={() => setSyncOpen(false)} sync={sync} />
      <DropOverlay onDrop={importFiles} />
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex flex-1 items-center justify-center bg-bg-surface/35 p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-bg-elevated text-accent">
          <Icon name="fileText" size={22} />
        </div>
        <h2 className="text-base text-text-primary">No notes yet</h2>
        <p className="mt-1 text-sm text-text-muted">
          Create a note, or drop Markdown files here to import them.
        </p>
        <Button variant="primary" onClick={onCreate} className="mt-5">
          <Icon name="plus" strokeWidth={2.4} />
          New note
        </Button>
        <p className="mt-3 text-xs text-text-muted">
          or press{" "}
          <kbd className="rounded border border-border px-1.5 font-mono">Alt + N</kbd>
        </p>
      </div>
    </section>
  );
}

function WorkspaceSkeleton() {
  return (
    <section
      aria-label="Loading notes"
      aria-busy
      className="flex-1 animate-pulse space-y-3 bg-bg-surface/35 p-6"
    >
      <div className="h-6 w-1/3 rounded bg-bg-elevated" />
      <div className="h-4 w-2/3 rounded bg-bg-elevated" />
      <div className="h-4 w-1/2 rounded bg-bg-elevated" />
    </section>
  );
}
