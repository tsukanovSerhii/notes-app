"use client";

import { useEffect, useState } from "react";
import type { Note } from "@/app/types/note";
import type { NoteVersion } from "@/app/lib/notes/history";
import { noteHistory } from "@/app/hooks/useNotes";
import Modal from "@/app/components/ui/Modal";
import Button from "@/app/components/ui/Button";
import Icon from "@/app/components/ui/Icon";
import Markdown from "@/app/components/editor/Markdown";
import { useI18n } from "@/app/lib/i18n";
import { excerpt } from "@/app/lib/text";
import { cn } from "@/app/lib/cn";

interface HistoryDialogProps {
  note: Note | null;
  onClose: () => void;
  onRestore: (version: NoteVersion) => void;
}

/** Earlier versions of a note, with a preview and a way back to any of them. */
export default function HistoryDialog({ note, onClose, onRestore }: HistoryDialogProps) {
  const { t, locale } = useI18n();
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [selected, setSelected] = useState(0);
  const noteId = note?.id;

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    void noteHistory.list(noteId).then((list) => {
      if (cancelled) return;
      setVersions(list);
      setSelected(0);
    });
    return () => {
      cancelled = true;
      setVersions(null);
    };
  }, [noteId]);

  const format = (at: number) =>
    new Date(at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const version = versions?.[selected];

  return (
    <Modal open={note !== null} onClose={onClose} title={t.history.title} wide>
      {versions !== null && versions.length === 0 && (
        <p className="text-sm text-text-muted">{t.history.empty}</p>
      )}
      {versions !== null && versions.length > 0 && version && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <ul aria-label={t.history.title} className="max-h-80 shrink-0 space-y-1 overflow-y-auto sm:w-48">
            {versions.map((v, i) => (
              <li key={`${v.at}-${i}`}>
                <button
                  type="button"
                  aria-current={i === selected ? "true" : undefined}
                  onClick={() => setSelected(i)}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
                    i === selected ? "bg-accent-glow text-accent" : "text-text-secondary hover:bg-bg-base/60"
                  )}
                >
                  <span className="block font-medium">{format(v.at)}</span>
                  <span className="block truncate text-text-muted">{excerpt(v.content, 40, v.title) || v.title}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 flex-1 space-y-3">
            <div
              aria-label={t.history.versionOf(format(version.at))}
              className="prose prose-sm dark:prose-invert max-h-80 max-w-none overflow-y-auto rounded-md border border-border bg-bg-base/60 p-3 prose-headings:text-text-primary prose-p:text-text-secondary"
            >
              <p className="!mt-0 font-semibold text-text-primary">{version.title.trim() || t.common.untitled}</p>
              <Markdown>{version.content}</Markdown>
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => onRestore(version)}>
                <Icon name="restore" size={14} />
                {t.history.restore}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
