"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Note } from "@/app/types/note";
import Modal from "@/app/components/ui/Modal";
import Icon, { type IconName } from "@/app/components/ui/Icon";
import { fuzzyFilter } from "@/app/lib/fuzzy";
import { useI18n } from "@/app/lib/i18n";
import { cn } from "@/app/lib/cn";

export interface PaletteCommand {
  id: string;
  label: string;
  icon: IconName;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  notes: Note[];
  commands: PaletteCommand[];
  onOpenNote: (id: string) => void;
}

type Item = { kind: "note"; note: Note } | { kind: "command"; command: PaletteCommand };

const MAX_NOTES = 8;

/** Jump to any note or run any command from the keyboard. */
export default function CommandPalette(props: CommandPaletteProps) {
  const { t } = useI18n();
  return (
    <Modal open={props.open} onClose={props.onClose} title={t.palette.label}>
      {/* Mounted only while open, so every opening starts empty. */}
      {props.open && <PaletteBody {...props} />}
    </Modal>
  );
}

function PaletteBody({ onClose, notes, commands, onOpenNote }: CommandPaletteProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // showModal() moves focus to the dialog's first button after mount; take it back.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const items = useMemo<Item[]>(() => {
    const live = notes.filter((n) => n.trashedAt === null);
    const matchedNotes = query.trim()
      ? fuzzyFilter(live, query, (n) => n.title || t.common.untitled)
      : live;
    const matchedCommands = fuzzyFilter(commands, query, (c) => c.label);
    return [
      ...matchedNotes.slice(0, MAX_NOTES).map((note) => ({ kind: "note" as const, note })),
      ...matchedCommands.map((command) => ({ kind: "command" as const, command })),
    ];
  }, [notes, commands, query, t]);

  const active = Math.min(cursor, Math.max(0, items.length - 1));
  const run = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (item.kind === "note") onOpenNote(item.note.id);
    else item.command.run();
  };

  const firstCommand = items.findIndex((i) => i.kind === "command");

  return (
    <div className="-mt-2 space-y-2">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((active + 1) % Math.max(1, items.length));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((active - 1 + items.length) % Math.max(1, items.length));
          } else if (e.key === "Enter") {
            e.preventDefault();
            run(items[active]);
          }
        }}
        placeholder={t.palette.placeholder}
        aria-label={t.palette.placeholder}
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-results"
        aria-activedescendant={items.length ? `palette-item-${active}` : undefined}
        className="w-full rounded-md border border-border bg-bg-base/60 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
      />
      <ul id="palette-results" role="listbox" aria-label={t.palette.label} className="max-h-80 overflow-y-auto">
        {items.length === 0 && <li className="px-2 py-6 text-center text-xs text-text-muted">{t.palette.empty}</li>}
        {items.map((item, i) => (
          <li key={item.kind === "note" ? `n-${item.note.id}` : `c-${item.command.id}`} role="presentation">
            {(i === 0 && item.kind === "note") || i === firstCommand ? (
              <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {item.kind === "note" ? t.palette.notes : t.palette.commands}
              </p>
            ) : null}
            <button
              id={`palette-item-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onMouseMove={() => setCursor(i)}
              onClick={() => run(item)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                i === active ? "bg-accent-glow text-accent" : "text-text-primary"
              )}
            >
              <Icon name={item.kind === "note" ? "fileText" : item.command.icon} size={14} className="shrink-0" />
              <span className="truncate">
                {item.kind === "note" ? item.note.title.trim() || t.common.untitled : item.command.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
