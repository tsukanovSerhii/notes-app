"use client";

// Main app shell — navbar + three-column layout (Sidebar | Editor | Preview)
// sitting above the galaxy background with blurred glass panels.

import { useNotes } from "@/app/hooks/useNotes";
import Sidebar from "@/app/components/sidebar/Sidebar";
import Editor from "@/app/components/editor/Editor";
import Preview from "@/app/components/editor/Preview";
import ExportButton from "@/app/components/editor/ExportButton";
import type { NoteTemplate } from "@/app/lib/templates";

export default function Home() {
  const {
    activeNote,
    setActiveNote,
    createNote,
    updateNote,
    deleteNote,
    searchQuery,
    setSearchQuery,
    filteredNotes,
    hydrated,
  } = useNotes();

  // Insert a template into the active note. If the title is still the default
  // "Untitled", adopt the template's title too.
  const applyTemplate = (template: NoteTemplate) => {
    if (!activeNote) return;
    const content = activeNote.content
      ? `${activeNote.content}\n\n${template.body}`
      : template.body;
    const title =
      !activeNote.title || activeNote.title === "Untitled"
        ? template.title
        : activeNote.title;
    updateNote(activeNote.id, { content, title });
  };

  return (
    <div className="relative z-2 flex h-screen flex-col">
      {/* Navbar */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-bg-surface/70 px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-text-primary">
            Note<span className="text-accent">Void</span>
          </span>
        </div>
        <ExportButton title={activeNote?.title} />
      </header>

      {/* Body: three columns */}
      <main className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <div className="bg-bg-surface/55 backdrop-blur-xl">
          <Sidebar
            notes={filteredNotes}
            activeId={activeNote?.id ?? null}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelect={setActiveNote}
            onDelete={deleteNote}
            onCreate={createNote}
          />
        </div>

        {activeNote ? (
          <>
            {/* Editor column */}
            <section className="flex min-w-0 flex-1 flex-col border-r border-border bg-bg-surface/55 backdrop-blur-xl">
              <input
                type="text"
                value={activeNote.title}
                onChange={(e) =>
                  updateNote(activeNote.id, { title: e.target.value })
                }
                placeholder="Untitled"
                className="border-b border-border bg-transparent px-6 py-3 text-base font-semibold text-text-primary placeholder:text-text-muted outline-none"
              />
              <div className="min-h-0 flex-1">
                <Editor
                  value={activeNote.content}
                  onChange={(content) =>
                    updateNote(activeNote.id, { content })
                  }
                  onTemplate={applyTemplate}
                />
              </div>
            </section>

            {/* Preview column */}
            <section className="min-w-0 flex-1 bg-bg-surface/55 backdrop-blur-xl">
              <Preview content={activeNote.content} />
            </section>
          </>
        ) : (
          <section className="flex flex-1 items-center justify-center bg-bg-surface/55 backdrop-blur-xl">
            <div className="text-center">
              <p className="text-text-muted">
                {hydrated
                  ? "Select a note or create a new one to begin."
                  : "Loading..."}
              </p>
              {hydrated && (
                <button
                  type="button"
                  onClick={createNote}
                  className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg-base transition-opacity hover:opacity-90"
                >
                  + New note
                </button>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
