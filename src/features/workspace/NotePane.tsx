"use client";

import { useMemo, useRef, type Ref } from "react";
import type { Folder, Note } from "@/features/notes/model/types";
import type { NotesStore, SaveStatus } from "@/features/notes/state/store";
import Editor from "@/features/editor/Editor";
import NoteMeta from "@/features/editor/NoteMeta";
import type { ViewMode } from "@/features/editor/ViewModeToggle";
import type { NoteTemplate } from "@/features/editor/lib/templates";
import Preview from "@/features/markdown/Preview";
import Backlinks from "@/features/markdown/Backlinks";
import { WikiLinkContext, type WikiLinkTarget } from "@/features/markdown/wikiLinkContext";
import { backlinks, findNoteByTitle } from "@/features/markdown/lib/wikiLinks";
import { useI18n } from "@/shared/i18n";
import { cn } from "@/shared/lib/cn";

/** The open note: title, folder and tags, editor and preview, per the view mode. */
export default function NotePane({
  note,
  notes,
  folders,
  allTags,
  mode,
  saveStatus,
  store,
  folderForNewNotes,
  titleRef,
  onOpen,
  onShowHistory,
  templates,
  onTemplate,
  onSaveTemplate,
  onAttach,
  onRenamed,
}: {
  note: Note;
  /** Live notes, for wiki links and backlinks. */
  notes: Note[];
  folders: Folder[];
  allTags: string[];
  mode: ViewMode;
  saveStatus: SaveStatus;
  store: NotesStore;
  /** Where a note created from a [[link]] goes. */
  folderForNewNotes: string | null;
  titleRef: Ref<HTMLInputElement>;
  onOpen: (id: string) => void;
  onShowHistory: () => void;
  templates: NoteTemplate[];
  onTemplate: (template: NoteTemplate) => void;
  onSaveTemplate: () => void;
  /** Stores files and returns the Markdown that shows them. */
  onAttach: (files: File[]) => Promise<string>;
  /** The title was committed (field left) with a different value than it had on focus. */
  onRenamed: (note: Note, oldTitle: string) => void;
}) {
  const { t } = useI18n();
  const titleOnFocus = useRef(note.title);
  const linkedFrom = useMemo(() => backlinks(notes, note), [notes, note]);

  // [[Title]] links in the preview open that note, or create it.
  const wikiTarget = useMemo<WikiLinkTarget>(
    () => ({
      exists: (title) => findNoteByTitle(notes, title) !== null,
      open: (title) => {
        const found = findNoteByTitle(notes, title);
        if (found) store.select(found.id);
        else store.create({ title, folderId: folderForNewNotes });
      },
    }),
    [notes, store, folderForNewNotes]
  );

  return (
    <>
      {mode !== "preview" && (
        <section
          aria-label={t.editor.label}
          className={cn("flex min-w-0 flex-1 flex-col bg-bg-surface/35", mode === "split" && "border-r border-border")}
        >
          <input
            ref={titleRef}
            type="text"
            value={note.title}
            onFocus={() => (titleOnFocus.current = note.title)}
            onBlur={() => {
              if (titleOnFocus.current.trim() !== note.title.trim()) onRenamed(note, titleOnFocus.current);
            }}
            onChange={(e) => store.update(note.id, { title: e.target.value })}
            placeholder={t.common.untitled}
            aria-label={t.note.title}
            className="border-b border-border bg-transparent px-4 py-3 text-base font-semibold text-text-primary placeholder:text-text-muted outline-none sm:px-6"
          />
          <NoteMeta
            key={note.id}
            note={note}
            folders={folders}
            allTags={allTags}
            onChange={(patch) => store.update(note.id, patch)}
            onShowHistory={onShowHistory}
          />
          <div className="min-h-0 flex-1">
            <Editor
              key={note.id}
              value={note.content}
              saveStatus={saveStatus}
              onChange={(content) => store.update(note.id, { content })}
              templates={templates}
              onTemplate={onTemplate}
              onSaveTemplate={onSaveTemplate}
              onAttach={onAttach}
            />
          </div>
          <Backlinks notes={linkedFrom} onOpen={onOpen} />
        </section>
      )}

      {mode !== "edit" && (
        <section className="flex min-w-0 flex-1 flex-col bg-bg-surface/35">
          <div className="min-h-0 flex-1">
            <WikiLinkContext.Provider value={wikiTarget}>
              <Preview content={note.content} />
            </WikiLinkContext.Provider>
          </div>
          {mode === "preview" && <Backlinks notes={linkedFrom} onOpen={onOpen} />}
        </section>
      )}
    </>
  );
}
