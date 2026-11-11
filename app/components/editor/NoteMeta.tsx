"use client";

import { useState } from "react";
import type { Folder, Note } from "@/app/types/note";
import Icon from "@/app/components/ui/Icon";
import { normalizeTag } from "@/app/lib/notes/storage";
import { useI18n } from "@/app/lib/i18n";

interface NoteMetaProps {
  note: Note;
  folders: Folder[];
  allTags: string[];
  onChange: (patch: Partial<Pick<Note, "folderId" | "tags">>) => void;
  onShowHistory?: () => void;
}

export default function NoteMeta({ note, folders, allTags, onChange, onShowHistory }: NoteMetaProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    setDraft("");
    if (tag && !note.tags.includes(tag)) onChange({ tags: [...note.tags, tag] });
  };
  const removeTag = (tag: string) =>
    onChange({ tags: note.tags.filter((t) => t !== tag) });

  const suggestions = allTags.filter((t) => !note.tags.includes(t));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-2 text-xs sm:px-6">
      <label className="flex items-center gap-1.5 text-text-muted">
        <Icon name="folder" size={13} />
        <span className="sr-only">{t.note.folder}</span>
        <select
          value={note.folderId ?? ""}
          onChange={(e) => onChange({ folderId: e.target.value || null })}
          aria-label={t.note.folder}
          className="max-w-40 cursor-pointer rounded bg-transparent py-0.5 text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <option value="" className="bg-bg-elevated">
            {t.note.noFolder}
          </option>
          {folders.map((f) => (
            <option key={f.id} value={f.id} className="bg-bg-elevated">
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <Icon name="tag" size={13} className="text-text-muted" />
        <ul className="contents" aria-label={t.library.tags}>
          {note.tags.map((tag) => (
            <li
              key={tag}
              className="flex items-center gap-0.5 rounded-full bg-accent-glow py-0.5 pl-2 pr-1 text-accent"
            >
              #{tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={t.note.removeTag(tag)}
                className="rounded-full p-0.5 hover:bg-accent/20 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
              >
                <Icon name="x" size={10} />
              </button>
            </li>
          ))}
        </ul>
        <input
          value={draft}
          onChange={(e) => {
            const value = e.target.value;
            if (/[,\s]$/.test(value)) addTag(value);
            else setDraft(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(draft);
            } else if (e.key === "Backspace" && !draft && note.tags.length) {
              removeTag(note.tags[note.tags.length - 1]);
            }
          }}
          onBlur={() => draft && addTag(draft)}
          list={`tag-suggestions-${note.id}`}
          placeholder={note.tags.length ? "" : t.note.addTagPlaceholder}
          aria-label={t.note.addTag}
          className="w-24 min-w-0 flex-1 bg-transparent py-0.5 text-text-primary outline-none placeholder:text-text-muted"
        />
        <datalist id={`tag-suggestions-${note.id}`}>
          {suggestions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
      {onShowHistory && (
        <button
          type="button"
          onClick={onShowHistory}
          title={t.note.history}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-text-muted transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
        >
          <Icon name="history" size={13} />
          <span className="hidden sm:inline">{t.note.history}</span>
          <span className="sr-only sm:hidden">{t.note.history}</span>
        </button>
      )}
    </div>
  );
}
