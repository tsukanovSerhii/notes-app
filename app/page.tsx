"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotes } from "@/app/hooks/useNotes";
import { useMediaQuery } from "@/app/hooks/useMediaQuery";
import Sidebar from "@/app/components/sidebar/Sidebar";
import Editor from "@/app/components/editor/Editor";
import Preview from "@/app/components/editor/Preview";
import ExportMenu from "@/app/components/editor/ExportMenu";
import ViewModeToggle, { type ViewMode } from "@/app/components/editor/ViewModeToggle";
import Button from "@/app/components/ui/Button";
import Icon from "@/app/components/ui/Icon";
import Toast, { type ToastMessage } from "@/app/components/ui/Toast";
import { filterNotes } from "@/app/lib/notes/reducer";
import type { NoteTemplate } from "@/app/lib/templates";
import { cn } from "@/app/lib/cn";

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

export default function Home() {
  const {
    notes,
    activeNote,
    hydrated,
    saveStatus,
    createNote,
    updateNote,
    deleteNote,
    undoDelete,
    togglePin,
    selectNote,
  } = useNotes();

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const isDesktop = useMediaQuery("(min-width: 768px)", true);
  const isWide = useMediaQuery("(min-width: 1024px)", true);
  const effectiveMode: ViewMode = !isWide && viewMode === "split" ? "edit" : viewMode;

  const visibleNotes = useMemo(
    () => filterNotes(notes, searchQuery),
    [notes, searchQuery]
  );

  const showToast = useCallback((message: Omit<ToastMessage, "id">) => {
    setToast({ ...message, id: Date.now() });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);
  const showError = useCallback(
    (text: string) => showToast({ text, tone: "error" }),
    [showToast]
  );

  const handleCreate = useCallback(() => {
    createNote();
    setSearchQuery("");
    setDrawerOpen(false);
    if (viewMode === "preview") setViewMode("split");
    requestAnimationFrame(() => titleRef.current?.select());
  }, [createNote, viewMode]);

  const handleSelect = useCallback(
    (id: string) => {
      selectNote(id);
      setDrawerOpen(false);
    },
    [selectNote]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id);
      deleteNote(id);
      showToast({
        text: `Deleted “${note?.title.trim() || "Untitled"}”`,
        action: { label: "Undo", onClick: undoDelete },
      });
    },
    [notes, deleteNote, undoDelete, showToast]
  );

  const applyTemplate = (template: NoteTemplate) => {
    if (!activeNote) return;
    const body = template.body();
    const content = activeNote.content ? `${activeNote.content}\n\n${body}` : body;
    const title =
      !activeNote.title.trim() || activeNote.title === "Untitled"
        ? template.title
        : activeNote.title;
    updateNote(activeNote.id, { content, title });
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
      totalCount={notes.length}
      activeId={activeNote?.id ?? null}
      searchQuery={searchQuery}
      searchRef={searchRef}
      onSearchChange={setSearchQuery}
      onSelect={handleSelect}
      onDelete={handleDelete}
      onTogglePin={togglePin}
      onCreate={handleCreate}
    />
  );

  return (
    <div className="relative z-2 flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-bg-surface/45 px-3 py-2.5 sm:px-5">
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

        <div className="ml-auto flex items-center gap-2">
          {activeNote && (
            <ViewModeToggle
              value={effectiveMode}
              onChange={setViewMode}
              allowSplit={isWide}
            />
          )}
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
                  onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
                  placeholder="Untitled"
                  aria-label="Note title"
                  className="border-b border-border bg-transparent px-4 py-3 text-base font-semibold text-text-primary placeholder:text-text-muted outline-none sm:px-6"
                />
                <div className="min-h-0 flex-1">
                  <Editor
                    key={activeNote.id}
                    value={activeNote.content}
                    saveStatus={saveStatus}
                    onChange={(content) => updateNote(activeNote.id, { content })}
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
          Create a note to start writing in Markdown.
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
