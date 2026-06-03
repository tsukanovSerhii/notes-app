"use client";

// MarkdownCheatsheet — a "?" button that opens a small popover listing
// common Markdown syntax, so users don't have to memorize it.

import { useEffect, useRef, useState } from "react";

const ROWS: { syntax: string; result: string }[] = [
  { syntax: "# Heading", result: "Big heading" },
  { syntax: "## Subheading", result: "Smaller heading" },
  { syntax: "**bold**", result: "bold" },
  { syntax: "*italic*", result: "italic" },
  { syntax: "- item", result: "Bullet list" },
  { syntax: "1. item", result: "Numbered list" },
  { syntax: "- [ ] task", result: "Checkbox" },
  { syntax: "[text](url)", result: "Link" },
  { syntax: "`code`", result: "Inline code" },
  { syntax: "```\\ncode\\n```", result: "Code block" },
  { syntax: "> quote", result: "Blockquote" },
  { syntax: "| a | b |", result: "Table" },
  { syntax: "---", result: "Divider" },
];

export default function MarkdownCheatsheet() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Markdown help"
        title="Markdown help"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-xs font-semibold text-text-muted transition-colors hover:border-accent hover:text-text-primary"
      >
        ?
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-20 w-72 rounded-lg border border-border bg-bg-elevated p-3 shadow-xl">
          <p className="mb-2 text-xs font-semibold text-text-primary">
            Markdown cheatsheet
          </p>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.syntax} className="border-b border-border/50">
                    <td className="py-1.5 pr-2 font-mono text-accent">
                      {r.syntax}
                    </td>
                    <td className="py-1.5 text-right text-text-muted">
                      {r.result}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
