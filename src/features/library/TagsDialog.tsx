"use client";

import { useState } from "react";
import Modal from "@/shared/ui/Modal";
import Button from "@/shared/ui/Button";
import { normalizeTag } from "@/features/notes/model/schema";
import { useI18n } from "@/shared/i18n";

interface TagsDialogProps {
  open: boolean;
  tags: { tag: string; count: number }[];
  onClose: () => void;
  /** Renames a tag everywhere; an existing target tag merges the two. */
  onRename: (from: string, to: string) => void;
  onDelete: (tag: string) => void;
}

/** Rename, merge or delete a tag in all notes at once. */
export default function TagsDialog({ open, tags, onClose, onRename, onDelete }: TagsDialogProps) {
  const { t, count } = useI18n();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const target = normalizeTag(draft);
  const merges = editing !== null && target !== "" && target !== editing && tags.some((x) => x.tag === target);

  const finish = () => {
    if (editing !== null && target && target !== editing) onRename(editing, target);
    setEditing(null);
  };

  return (
    <Modal open={open} onClose={onClose} title={t.tags.title}>
      {tags.length === 0 ? (
        <p className="text-sm text-text-muted">{t.tags.empty}</p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {tags.map(({ tag, count: uses }) => (
            <li key={tag} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-bg-base/40">
              {editing === tag ? (
                <form
                  className="flex min-w-0 flex-1 flex-col gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    finish();
                  }}
                >
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setEditing(null);
                        }
                      }}
                      aria-label={t.tags.newName(tag)}
                      className="min-w-0 flex-1 rounded-md border border-border bg-bg-base/60 px-2 py-1 text-sm text-text-primary outline-none focus:border-accent"
                    />
                    <Button type="submit" disabled={!target || target === tag}>
                      {merges ? t.tags.merge : t.tags.rename}
                    </Button>
                  </div>
                  {merges && <p className="text-xs text-text-muted">{t.tags.mergeHint(target)}</p>}
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">#{tag}</span>
                  <span className="text-xs text-text-muted">{count(uses, t.plural.notes)}</span>
                  {confirming === tag ? (
                    <>
                      <Button
                        type="button"
                        onClick={() => {
                          onDelete(tag);
                          setConfirming(null);
                        }}
                      >
                        {t.tags.confirmDelete(tag)}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
                        {t.common.cancel}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={t.tags.renameTag(tag)}
                        onClick={() => {
                          setEditing(tag);
                          setDraft(tag);
                        }}
                      >
                        {t.tags.rename}
                      </Button>
                      <Button type="button" variant="ghost" aria-label={t.tags.deleteTag(tag)} onClick={() => setConfirming(tag)}>
                        {t.common.delete}
                      </Button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
