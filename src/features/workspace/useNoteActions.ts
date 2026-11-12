"use client";

import type { Folder, Note } from "@/features/notes/model/types";
import type { NotesStore } from "@/features/notes/state/store";
import type { NoteVersion } from "@/features/history/history";
import { historyRecorder } from "@/features/history/noteHistory";
import { templateName, type NoteTemplate } from "@/features/editor/lib/templates";
import { TEMPLATES_FOLDER, templatesFolder } from "@/features/editor/lib/userTemplates";
import { archiveFileName, backupFileName, createBackup } from "@/features/transfer/importExport";
import { collectBackupAttachments } from "@/features/transfer/backupAttachments";
import { attachmentStore } from "@/features/attachments/localAttachments";
import { findNoteByTitle, renameLinkTarget } from "@/features/markdown/lib/wikiLinks";
import { retag } from "@/features/library/lib/tagOps";
import { normalizeTag } from "@/features/notes/model/schema";
import { canMoveFolder, folderPath } from "@/features/notes/model/folders";
import { downloadBlob, downloadText } from "@/shared/lib/download";
import { buildArchive } from "@/features/transfer/exportAll";
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

  /** Renames a tag in every note, the trash included; an existing target merges. */
  const renameTag = (from: string, to: string) => {
    const patches = retag(store.getData().notes, from, to);
    for (const p of patches) store.update(p.id, { tags: p.tags });
    const target = normalizeTag(to);
    const merged = notes.some((n) => n.tags.includes(target));
    const text = (merged ? t.toast.tagMerged : t.toast.tagRenamed)(from, target, count(patches.length, t.plural.notes));
    showToast({ text });
  };

  const deleteTag = (tag: string) => {
    const patches = retag(store.getData().notes, tag, null);
    for (const p of patches) store.update(p.id, { tags: p.tags });
    showToast({ text: t.toast.tagDeleted(tag, count(patches.length, t.plural.notes)) });
  };

  const exportZip = async () => {
    const data = store.getData();
    const { zip, notes: exported } = await buildArchive(data.notes, data.folders, attachmentStore);
    downloadBlob(archiveFileName(), zip as BlobPart, "application/zip");
    showToast({ text: t.toast.archiveDownloaded(count(exported, t.plural.notes)) });
  };

  const downloadBackup = async () => {
    const data = store.getData();
    const backup = createBackup(data, new Date(), await collectBackupAttachments(data.notes, attachmentStore));
    downloadText(backupFileName(), JSON.stringify(backup, null, 2), "application/json");
    showToast({ text: t.toast.backupDownloaded(count(backup.notes.length, t.plural.notes)) });
  };

  const applyTemplate = (template: NoteTemplate) => {
    if (!activeNote) return;
    const body = template.body();
    const content = activeNote.content ? `${activeNote.content}\n\n${body}` : body;
    const untitled =
      !activeNote.title.trim() || activeNote.title === "Untitled" || activeNote.title === t.common.untitled;
    store.update(activeNote.id, { content, title: untitled ? templateName(template, t.templates) : activeNote.title });
  };

  /** Keeps the open note as a template: a note in the Templates folder, made if needed. */
  const saveAsTemplate = () => {
    if (!activeNote) return;
    const folder = templatesFolder(folders) ?? store.createFolder(TEMPLATES_FOLDER);
    if (!folder) return;
    const title = activeNote.title.trim() || t.common.untitled;
    const existing = notes.find((n) => n.folderId === folder.id && n.title.trim() === title);
    if (existing) {
      store.update(existing.id, { content: activeNote.content });
      showToast({ text: t.toast.templateUpdated(title) });
    } else {
      store.create({ title, content: activeNote.content, folderId: folder.id });
      // Creating a note opens it; the one being worked on stays open.
      store.select(activeNote.id);
      showToast({ text: t.toast.templateSaved(title) });
    }
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
    renameTag,
    deleteTag,
    downloadBackup,
    exportZip,
    applyTemplate,
    saveAsTemplate,
    renameLinks,
    restoreVersion,
  };
}

export type NoteActions = ReturnType<typeof useNoteActions>;
