"use client";

import { useRef, useState } from "react";
import { templateName, type NoteTemplate } from "@/features/editor/lib/templates";
import MarkdownCheatsheet from "@/features/editor/MarkdownCheatsheet";
import Outline from "@/features/editor/Outline";
import type { Heading } from "@/features/editor/lib/outline";
import Icon, { type IconName } from "@/shared/ui/Icon";
import { useDismiss } from "@/shared/hooks/useDismiss";
import { cn } from "@/shared/lib/cn";
import { useI18n } from "@/shared/i18n";

export interface ToolbarProps {
  onWrap: (before: string, after: string, placeholder?: string) => void;
  onPrefix: (prefix: string, ordered?: boolean) => void;
  onInsert: (text: string) => void;
  templates: NoteTemplate[];
  onTemplate: (template: NoteTemplate) => void;
  onSaveTemplate: () => void;
  onPickFile: () => void;
  content: string;
  onJump: (heading: Heading) => void;
}

const TABLE = `| Column A | Column B |
| --- | --- |
| cell | cell |
`;

const CODE_BLOCK = "```\ncode\n```\n";

export default function Toolbar({
  onWrap,
  onPrefix,
  onInsert,
  templates,
  onTemplate,
  onSaveTemplate,
  onPickFile,
  content,
  onJump,
}: ToolbarProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuRef, menuOpen, () => setMenuOpen(false));

  return (
    <div
      role="toolbar"
      aria-label={t.editor.formatting}
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5 sm:px-3"
    >
      <Btn label={t.editor.bold} onClick={() => onWrap("**", "**", "bold")}>
        <span className="text-sm font-bold">B</span>
      </Btn>
      <Btn label={t.editor.italic} onClick={() => onWrap("*", "*", "italic")}>
        <span className="font-serif text-sm italic">I</span>
      </Btn>
      <Btn label={t.editor.heading} onClick={() => onPrefix("## ")}>
        <span className="text-sm font-semibold">H</span>
      </Btn>

      <Divider />

      <Btn label={t.editor.bulletList} icon="list" onClick={() => onPrefix("- ")} />
      <Btn label={t.editor.numberedList} icon="listOrdered" onClick={() => onPrefix("", true)} />
      <Btn label={t.editor.checkbox} icon="checkbox" onClick={() => onPrefix("- [ ] ")} />
      <Btn label={t.editor.quote} icon="quote" onClick={() => onPrefix("> ")} />

      <Divider />

      <Btn label={t.editor.link} icon="link" onClick={() => onWrap("[", "](url)", "text")} />
      <Btn label={t.editor.inlineCode} icon="code" onClick={() => onWrap("`", "`", "code")} />
      <Btn label={t.editor.codeBlock} icon="codeBlock" onClick={() => onInsert(CODE_BLOCK)} />
      <Btn label={t.editor.table} icon="table" onClick={() => onInsert(TABLE)} />
      <Btn label={t.editor.attach} icon="image" onClick={onPickFile} />

      <Divider />

      <Outline content={content} onJump={onJump} />

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors",
            "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
            menuOpen
              ? "bg-accent-glow text-accent"
              : "text-text-primary/80 hover:bg-accent-glow hover:text-accent"
          )}
        >
          <Icon name="layoutTemplate" size={14} />
          {t.editor.templates}
          <Icon name="chevronDown" size={12} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute left-0 top-9 z-30 w-44 rounded-lg border border-border bg-bg-elevated p-1 shadow-xl"
          >
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onTemplate(tpl);
                  setMenuOpen(false);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs text-text-primary transition-colors hover:bg-accent-glow hover:text-accent focus-visible:bg-accent-glow focus-visible:outline-none"
              >
                {templateName(tpl, t.templates)}
              </button>
            ))}
            <div role="separator" className="my-1 border-t border-border" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onSaveTemplate();
                setMenuOpen(false);
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs text-text-muted transition-colors hover:bg-accent-glow hover:text-accent focus-visible:bg-accent-glow focus-visible:outline-none"
            >
              {t.editor.saveAsTemplate}
            </button>
          </div>
        )}
      </div>

      <div className="ml-auto pl-1">
        <MarkdownCheatsheet />
      </div>
    </div>
  );
}

function Btn({
  label,
  icon,
  onClick,
  children,
}: {
  label: string;
  icon?: IconName;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
        "text-text-primary/80 transition-colors",
        "hover:bg-accent-glow hover:text-accent active:scale-95",
        "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none"
      )}
    >
      {icon ? <Icon name={icon} /> : children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;
}
