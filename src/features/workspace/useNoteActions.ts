"use client";

import type { Folder, Note } from "@/features/notes/model/types";
import type { NotesStore } from "@/features/notes/state/store";
import type { NoteVersion } from "@/features/history/history";
import { historyRecorder } from "@/features/history/noteHistory";
import type { NoteTemplate } from "@/features/editor/lib/templates";
import { backupFileName, createBackup } from "@/features/transfer/importExport";
import { findNoteByTitle, renameLinkTarget } from "@/features/markdown/lib/wikiLinks";
import { canMoveFolder, folderPath } from "@/features/notes/model/folders";
import { downloadText } from "@/shared/lib/download";
import { useI18n } from "@/shared/i18n";
import type { ShowToast } from "@/features/workspace/useToast";

/** What the user can do to notes, each with the toast that confirms it. */
export function useNoteActions({
  store,
  notes,
  trash,
  folders,
  activeNote,
  showToast,
}: {
  store: NotesStore;
  notes: Note[];
  trash: Note[];
  folders: Folder[];
  activeNote: Note | null;
  showToast: ShowToast;
}) {
  const { t, count } = useI18n();
  const titleOf = (n: Note | undefined) => n?.title.trim() || t.common.untitled;

  /** Moves a note to the trash, or deletes it for good if it is already there. */
  const remove = (id: string) => {
    const trashed = trash.find((n) => n.id === id);
    if (trashed) {
      store.purge(id);
      showToast({ text: t.toast.deletedForever(titleOf(trashed)) });
      return;
    }
    store.remove(id);
    showToast({
      text: t.toast.movedToTrash(titleOf(notes.find((n) => n.id === id))),
      action: { label: t.common.undo, onClick: store.undoDelete },
    });
  };

  const restore = (id: string) => {
    const note = trash.find((n) => n.id === id);
    store.restore(id);
    showToast({ text: t.toast.restored(titleOf(note)) });
  };

  const emptyTrash = () => {
    const n = trash.length;
    store.emptyTrash();
    showToast({ text: t.toast.deletedManyForever(count(n, t.plural.notes)) });
  };

  /** A note dropped on a folder, on "All notes" (folderId null) or on the trash. */
  const moveNote = (id: string, target: { folderId: string | null } | "trash") => {
    if (target === "trash") return remove(id);
    const note = notes.find((n) => n.id === id);
    if (!note || note.folderId === target.folderId) return;
    store.update(id, { folderId: target.folderId });
    const folder = folders.find((f) => f.id === target.folderId);
    showToast({ text: t.toast.movedToFolder(titleOf(note), folder?.name ?? t.sidebar.allNotes) });
  };

  const deleteFolder = (id: string) => {
    const folder = folders.find((f) => f.id === id);
    store.deleteFolder(id);
    showToast({ text: t.toast.folderDeleted(folder?.name ?? "") });
  };

  const moveFolder = (id: string, parentId: string | null) => {
    const folder = folders.find((f) => f.id === id);
    if (!folder || folder.parentId === parentId || !canMoveFolder(folders, id, parentId)) return;
    store.moveFolder(id, parentId);
    showToast({
      text: t.toast.folderMoved(folder.name, parentId ? folderPath(folders, parentId) : t.sidebar.allNotes),
    });
  };

  const downloadBackup = () => {
    const backup = createBackup(store.getData());
    downloadText(backupFileName(), JSON.stringify(backup, null, 2), "application/json");
    showToast({ text: t.toast.backupDownloaded(count(backup.notes.length, t.plural.notes)) });
  };

  const applyTemplate = (template: NoteTemplate) => {
    if (!activeNote) return;
    const body = template.body();
    const content = activeNote.content ? `${activeNote.content}\n\n${body}` : body;
    const untitled =
      !activeNote.title.trim() || activeNote.title === "Untitled" || activeNote.title === t.common.untitled;
    store.update(activeNote.id, { content, title: untitled ? t.templates[template.id] : activeNote.title });
  };

  /**
   * After a note is renamed, retargets the [[links]] to its old title in other
   * notes. Skipped when another live note still has the old title (those links
   * stay valid). The versions replaced are kept by the history recorder.
   */
  const renameLinks = (renamed: Note, oldTitle: string) => {
    const others = notes.filter((n) => n.id !== renamed.id);
    if (findNoteByTitle(others, oldTitle)) return;
    let updated = 0;
    for (const n of others) {
      const content = renameLinkTarget(n.content, oldTitle, renamed.title);
      if (content !== n.content) {
        store.update(n.id, { content });
        updated++;
      }
    }
    if (updated > 0) showToast({ text: t.toast.linksUpdated(count(updated, t.plural.notes)) });
  };

  const restoreVersion = (version: NoteVersion) => {
    const current = notes.find((n) => n.id === version.noteId);
    if (!current) return;
    // Keep what is being replaced, so the restore itself can be undone.
    void historyRecorder?.keep(current);
    store.update(current.id, { title: version.title, content: version.content });
    showToast({ text: t.toast.versionRestored });
  };

  return {
    remove,
    restore,
    emptyTrash,
    moveNote,
    deleteFolder,
    moveFolder,
    downloadBackup,
    applyTemplate,
    renameLinks,
    restoreVersion,
  };
}

export type NoteActions = ReturnType<typeof useNoteActions>;
