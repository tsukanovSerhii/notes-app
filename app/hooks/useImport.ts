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

interface Feedback {
  success: (text: string) => void;
  error: (text: string) => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function useImport(store: NotesStore, folderId: string | null, feedback: Feedback) {
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
          `Imported ${plural(notes.length, "note")}` +
            (skipped ? `, skipped ${plural(skipped, "file")}` : "")
        );
      } else {
        feedback.error("No Markdown files to import (.md, .markdown or .txt, up to 5 MB).");
      }
    },
    [store, folderId, feedback]
  );

  const importBackup = useCallback(
    async (file: File) => {
      try {
        if (file.size > MAX_IMPORT_BYTES) throw new ImportError("The backup is larger than 5 MB.");
        const data = parseBackup(await file.text());
        store.merge(data, "import");
        feedback.success(`Restored ${plural(data.notes.length, "note")} from the backup`);
      } catch (error) {
        feedback.error(
          error instanceof ImportError ? error.message : "Could not read the backup file."
        );
      }
    },
    [store, feedback]
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
