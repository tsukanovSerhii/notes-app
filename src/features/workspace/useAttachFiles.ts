"use client";

import { useCallback } from "react";
import { MAX_ATTACHMENT_BYTES, markdownFor } from "@/features/attachments/attachments";
import { AttachmentTooLarge, addAttachment } from "@/features/attachments/ingest";
import { attachmentStore } from "@/features/attachments/localAttachments";
import type { Note } from "@/features/notes/model/types";
import type { NotesStore } from "@/features/notes/state/store";
import { isMarkdownFile } from "@/features/transfer/importExport";
import { useI18n } from "@/shared/i18n";

interface Feedback {
  error: (text: string) => void;
}

/** Appends a block to a note's text as its own paragraph. */
export const appendBlock = (content: string, block: string) =>
  content.trim() ? `${content.replace(/\n*$/, "")}\n\n${block}` : block;

/**
 * Adding files to notes. `attachFiles` stores them and returns the Markdown
 * that shows them, for the editor to place at the cursor; `dropFiles` handles
 * files dropped on the window: Markdown and backups are imported, the rest is
 * attached at the end of the open note.
 */
export function useAttachFiles({
  store,
  activeNote,
  feedback,
  importFiles,
}: {
  store: NotesStore;
  activeNote: Note | null;
  feedback: Feedback;
  importFiles: (files: File[]) => Promise<void>;
}) {
  const { t } = useI18n();

  const attachFiles = useCallback(
    async (files: File[]): Promise<string> => {
      const lines: string[] = [];
      for (const file of files) {
        try {
          lines.push(markdownFor(await addAttachment(attachmentStore, file)));
        } catch (error) {
          feedback.error(
            error instanceof AttachmentTooLarge
              ? t.attachments.tooLarge(file.name, `${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`)
              : t.attachments.failed(file.name)
          );
        }
      }
      return lines.length ? `${lines.join("\n")}\n` : "";
    },
    [feedback, t]
  );

  const dropFiles = useCallback(
    async (files: File[]) => {
      const importable = files.filter((f) => isMarkdownFile(f) || /\.json$/i.test(f.name));
      const rest = files.filter((f) => !importable.includes(f));
      if (importable.length) await importFiles(importable);
      if (rest.length === 0) return;
      if (!activeNote || activeNote.trashedAt !== null) {
        feedback.error(t.attachments.needNote);
        return;
      }
      const markdown = await attachFiles(rest);
      if (!markdown) return;
      // Read again: the note may have been edited while the files were stored.
      const current = store.getData().notes.find((n) => n.id === activeNote.id);
      if (current) store.update(current.id, { content: appendBlock(current.content, markdown) });
    },
    [activeNote, attachFiles, feedback, importFiles, store, t]
  );

  return { attachFiles, dropFiles };
}
