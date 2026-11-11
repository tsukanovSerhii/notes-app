"use client";

import { useCallback } from "react";
import type { NotesStore } from "@/app/lib/notes/store";
import { defaultCreateId } from "@/app/lib/notes/store";
import {
  ImportError,
  MAX_IMPORT_BYTES,
  isMarkdownFile,
  noteFromMarkdown,
  parseBackup,
} from "@/app/lib/importExport";
import { useI18n } from "@/app/lib/i18n";

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

  return { importMarkdown, importBackup, importFiles };
}
