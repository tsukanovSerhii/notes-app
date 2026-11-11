"use client";

import { useRef, useState } from "react";
import Icon from "@/app/components/ui/Icon";
import { useDismiss } from "@/app/hooks/useDismiss";
import { cn } from "@/app/lib/cn";
import { useI18n, type Messages } from "@/app/lib/i18n";

type CheatKey = keyof Messages["cheatsheet"];

const SYNTAX: { syntax: string; result: CheatKey }[] = [
  { syntax: "# Heading", result: "heading" },
  { syntax: "## Subheading", result: "subheading" },
  { syntax: "**bold**", result: "bold" },
  { syntax: "*italic*", result: "italic" },
  { syntax: "~~strike~~", result: "strike" },
  { syntax: "- item", result: "bullet" },
  { syntax: "1. item", result: "numbered" },
  { syntax: "- [ ] task", result: "checkbox" },
  { syntax: "[text](url)", result: "link" },
  { syntax: "[[Note title]]", result: "wikiLink" },
  { syntax: "`code`", result: "inlineCode" },
  { syntax: "```ts", result: "codeBlock" },
  { syntax: "> quote", result: "quote" },
  { syntax: "| a | b |", result: "table" },
  { syntax: "---", result: "divider" },
];

const SHORTCUTS: { keys: string; action: CheatKey }[] = [
  { keys: "Alt + N", action: "newNote" },
  { keys: "/", action: "searchNotes" },
  { keys: "Ctrl + Shift + P", action: "palette" },
  { keys: "Ctrl + B", action: "bold" },
  { keys: "Ctrl + I", action: "italic" },
  { keys: "Ctrl + K", action: "link" },
  { keys: "Enter", action: "continueList" },
];

export default function MarkdownCheatsheet() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.editor.help}
        aria-expanded={open}
        title={t.editor.help}
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
          aria-label={t.editor.cheatsheet}
          className="absolute right-0 top-9 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-bg-elevated p-3 shadow-xl"
        >
          <div className="max-h-96 overflow-y-auto pr-1">
            <Section title={t.editor.cheatsheet}>
              {SYNTAX.map((r) => (
                <Row key={r.syntax} left={r.syntax} right={t.cheatsheet[r.result]} />
              ))}
            </Section>
            <Section title={t.editor.shortcuts}>
              {SHORTCUTS.map((r) => (
                <Row key={r.keys} left={r.keys} right={t.cheatsheet[r.action]} />
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
