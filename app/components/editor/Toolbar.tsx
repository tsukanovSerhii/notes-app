"use client";

import { useEffect, useRef, useState } from "react";
import { TEMPLATES, type NoteTemplate } from "@/app/lib/templates";
import MarkdownCheatsheet from "@/app/components/editor/MarkdownCheatsheet";
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

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
      <Btn label="Bold (Ctrl+B)" onClick={() => onWrap("**", "**", "bold")}>
        <span className="font-bold">B</span>
      </Btn>
      <Btn label="Italic (Ctrl+I)" onClick={() => onWrap("*", "*", "italic")}>
        <span className="italic">I</span>
      </Btn>
      <Btn label="Heading" onClick={() => onPrefix("# ")}>
        <span className="font-semibold">H</span>
      </Btn>

      <Divider />

      <Btn label="Bullet list" onClick={() => onPrefix("- ")}>
        •
      </Btn>
      <Btn label="Numbered list" onClick={() => onPrefix("", true)}>
        1.
      </Btn>
      <Btn label="Checkbox" onClick={() => onPrefix("- [ ] ")}>
        ☑
      </Btn>
      <Btn label="Quote" onClick={() => onPrefix("> ")}>
        ❝
      </Btn>

      <Divider />

      <Btn label="Link (Ctrl+K)" onClick={() => onWrap("[", "](url)", "text")}>
        🔗
      </Btn>
      <Btn label="Inline code" onClick={() => onWrap("`", "`", "code")}>
        <span className="font-mono">{"</>"}</span>
      </Btn>
      <Btn label="Code block" onClick={() => onInsert(CODE_BLOCK)}>
        <span className="font-mono text-[10px]">{"{ }"}</span>
      </Btn>
      <Btn label="Table" onClick={() => onInsert(TABLE)}>
        ▦
      </Btn>

      <Divider />

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            "flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
            menuOpen
              ? "border-accent bg-accent-glow text-accent"
              : "border-border text-text-primary/80 hover:border-accent hover:text-accent"
          )}
        >
          Templates
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-9 z-20 w-44 rounded-lg border border-border bg-bg-elevated p-1 shadow-xl">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onTemplate(t);
                  setMenuOpen(false);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs text-text-primary transition-colors hover:bg-accent-glow hover:text-accent"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto">
        <MarkdownCheatsheet />
      </div>
    </div>
  );
}

function Btn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center rounded-md px-2",
        "text-sm text-text-primary/80 transition-colors",
        "hover:bg-accent-glow hover:text-accent active:scale-95"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}
