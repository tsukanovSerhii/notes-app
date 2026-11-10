"use client";

import { useRef, useState } from "react";
import Icon from "@/app/components/ui/Icon";
import { useDismiss } from "@/app/hooks/useDismiss";
import { cn } from "@/app/lib/cn";

const SYNTAX: { syntax: string; result: string }[] = [
  { syntax: "# Heading", result: "Big heading" },
  { syntax: "## Subheading", result: "Smaller heading" },
  { syntax: "**bold**", result: "Bold" },
  { syntax: "*italic*", result: "Italic" },
  { syntax: "~~strike~~", result: "Strikethrough" },
  { syntax: "- item", result: "Bullet list" },
  { syntax: "1. item", result: "Numbered list" },
  { syntax: "- [ ] task", result: "Checkbox" },
  { syntax: "[text](url)", result: "Link" },
  { syntax: "`code`", result: "Inline code" },
  { syntax: "```ts", result: "Code block" },
  { syntax: "> quote", result: "Blockquote" },
  { syntax: "| a | b |", result: "Table" },
  { syntax: "---", result: "Divider" },
];

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "Alt + N", action: "New note" },
  { keys: "/", action: "Search notes" },
  { keys: "Ctrl + B", action: "Bold" },
  { keys: "Ctrl + I", action: "Italic" },
  { keys: "Ctrl + K", action: "Link" },
  { keys: "Enter", action: "Continue list" },
];

export default function MarkdownCheatsheet() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Markdown help"
        aria-expanded={open}
        title="Markdown help"
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
          "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
          open
            ? "bg-accent-glow text-accent"
            : "text-text-primary/70 hover:bg-accent-glow hover:text-accent"
        )}
      >
        <Icon name="help" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Markdown cheatsheet"
          className="absolute right-0 top-9 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-bg-elevated p-3 shadow-xl"
        >
          <div className="max-h-96 overflow-y-auto pr-1">
            <Section title="Markdown cheatsheet">
              {SYNTAX.map((r) => (
                <Row key={r.syntax} left={r.syntax} right={r.result} />
              ))}
            </Section>
            <Section title="Keyboard shortcuts">
              {SHORTCUTS.map((r) => (
                <Row key={r.keys} left={r.keys} right={r.action} />
              ))}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-3 last:mb-0">
      <p className="mb-1.5 text-xs font-semibold text-text-primary">{title}</p>
      <table className="w-full text-xs">
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-1.5 pr-2 font-mono text-accent">{left}</td>
      <td className="py-1.5 text-right text-text-muted">{right}</td>
    </tr>
  );
}
