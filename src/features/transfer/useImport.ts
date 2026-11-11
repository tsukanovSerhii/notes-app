"use client";

import { useCallback } from "react";
import type { NotesStore } from "@/features/notes/state/store";
import { defaultCreateId } from "@/features/notes/state/store";
import {
  ImportError,
  MAX_IMPORT_BYTES,
  isMarkdownFile,
  noteFromMarkdown,
  parseBackup,
} from "@/features/transfer/importExport";
import { MAX_VAULT_FILE_BYTES, parseVault } from "@/features/transfer/importVault";
import type { Note } from "@/features/notes/model/types";
import { useI18n } from "@/shared/i18n";

interface Feedback {
  success: (text: string) => void;
  error: (text: string) => void;
}

export function useImport(store: NotesStore, folderId: string | null, feedback: Feedback) {
  const { t, count } = useI18n();
  const importMarkdown = useCallback(
    async (files: File[]) => {
      const accepted = files.filter((f) => isMarkdownFile(f) && f.size <= MAX_IMPORT_BYTES);
      const skipped = files.length - accepted.length;
      const now = Date.now();
      const notes = await Promise.all(
        accepted.map(async (file, i) => ({
          ...noteFromMarkdown(file.name, await file.text(), defaultCreateId(), now + i),
          folderId,
        }))
      );
      store.addNotes(notes);
      if (notes.length) {
        feedback.success(
          t.toast.imported(count(notes.length, t.plural.notes)) +
            (skipped ? t.toast.skipped(count(skipped, t.plural.files)) : "")
        );
      } else {
        feedback.error(t.toast.noMarkdown);
      }
    },
    [store, folderId, feedback, t, count]
  );

  /** A whole folder of notes (Obsidian vault, Notion export, any Markdown folder). */
  const importVault = useCallback(
    async (files: File[]) => {
      const readable = files.filter((f) => f.size <= MAX_VAULT_FILE_BYTES && /\.(md|markdown|mdown)$/i.test(f.name));
      const vaultFiles = await Promise.all(
        readable.map(async (f) => ({ path: f.webkitRelativePath || f.name, text: await f.text() }))
      );
      const { notes: parsed } = parseVault(vaultFiles);
      if (parsed.length === 0) {
        feedback.error(t.toast.vaultEmpty);
        return;
      }

      // One folder per distinct path (nested paths are joined until folders nest).
      const existing = new Map(store.getData().folders.map((f) => [f.name, f.id]));
      const folderIds = new Map<string, string>();
      for (const p of parsed) {
        const name = p.folderPath.join(" / ");
        if (!name || folderIds.has(name)) continue;
        const id = existing.get(name) ?? store.createFolder(name)?.id;
        if (id) folderIds.set(name, id);
      }

      const now = Date.now();
      const notes: Note[] = parsed.map((p, i) => ({
        id: defaultCreateId(),
        title: p.title,
        content: p.content,
        pinned: false,
        tags: p.tags,
        folderId: folderIds.get(p.folderPath.join(" / ")) ?? null,
        createdAt: now + i,
        updatedAt: now + i,
        editedAt: now + i,
        editedBy: null,
        trashedAt: null,
        conflictOf: null,
      }));
      store.addNotes(notes);
      feedback.success(
        t.toast.vaultImported(count(notes.length, t.plural.notes), count(folderIds.size, t.plural.folders))
      );
    },
    [store, feedback, t, count]
  );

  const importBackup = useCallback(
    async (file: File) => {
      try {
        if (file.size > MAX_IMPORT_BYTES) throw new ImportError(t.toast.backupTooLarge);
        const data = parseBackup(await file.text());
        store.merge(data, "import");
        feedback.success(t.toast.restoredBackup(count(data.notes.length, t.plural.notes)));
      } catch (error) {
        feedback.error(
          error instanceof ImportError ? error.message : t.toast.backupUnreadable
        );
      }
    },
    [store, feedback, t, count]
  );

  const importFiles = useCallback(
    async (files: File[]) => {
      const backup = files.find((f) => /\.json$/i.test(f.name));
      if (backup) await importBackup(backup);
      const rest = files.filter((f) => f !== backup);
      if (rest.length) await importMarkdown(rest);
    },
    [importBackup, importMarkdown]
  );

  return { importMarkdown, importVault, importBackup, importFiles };
}
