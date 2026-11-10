"use client";

import { useRef, useState } from "react";
import { TEMPLATES, type NoteTemplate } from "@/app/lib/templates";
import MarkdownCheatsheet from "@/app/components/editor/MarkdownCheatsheet";
import Icon, { type IconName } from "@/app/components/ui/Icon";
import { useDismiss } from "@/app/hooks/useDismiss";
import { cn } from "@/app/lib/cn";

export interface ToolbarProps {
  onWrap: (before: string, after: string, placeholder?: string) => void;
  onPrefix: (prefix: string, ordered?: boolean) => void;
  onInsert: (text: string) => void;
  onTemplate: (template: NoteTemplate) => void;
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
  onTemplate,
}: ToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuRef, menuOpen, () => setMenuOpen(false));

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5 sm:px-3"
    >
      <Btn label="Bold (Ctrl+B)" onClick={() => onWrap("**", "**", "bold")}>
        <span className="text-sm font-bold">B</span>
      </Btn>
      <Btn label="Italic (Ctrl+I)" onClick={() => onWrap("*", "*", "italic")}>
        <span className="font-serif text-sm italic">I</span>
      </Btn>
      <Btn label="Heading" onClick={() => onPrefix("## ")}>
        <span className="text-sm font-semibold">H</span>
      </Btn>

      <Divider />

      <Btn label="Bullet list" icon="list" onClick={() => onPrefix("- ")} />
      <Btn label="Numbered list" icon="listOrdered" onClick={() => onPrefix("", true)} />
      <Btn label="Checkbox" icon="checkbox" onClick={() => onPrefix("- [ ] ")} />
      <Btn label="Quote" icon="quote" onClick={() => onPrefix("> ")} />

      <Divider />

      <Btn label="Link (Ctrl+K)" icon="link" onClick={() => onWrap("[", "](url)", "text")} />
      <Btn label="Inline code" icon="code" onClick={() => onWrap("`", "`", "code")} />
      <Btn label="Code block" icon="codeBlock" onClick={() => onInsert(CODE_BLOCK)} />
      <Btn label="Table" icon="table" onClick={() => onInsert(TABLE)} />

      <Divider />

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
          Templates
          <Icon name="chevronDown" size={12} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute left-0 top-9 z-30 w-44 rounded-lg border border-border bg-bg-elevated p-1 shadow-xl"
          >
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onTemplate(t);
                  setMenuOpen(false);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs text-text-primary transition-colors hover:bg-accent-glow hover:text-accent focus-visible:bg-accent-glow focus-visible:outline-none"
              >
                {t.label}
              </button>
            ))}
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
