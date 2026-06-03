"use client";

// Editor — markdown textarea with a formatting toolbar, template insertion,
// keyboard shortcuts (Ctrl+B/I/K), and a live character count.

import { useRef } from "react";
import Toolbar from "@/app/components/editor/Toolbar";
import {
  wrapSelection,
  prefixLines,
  insertBlock,
  type EditResult,
} from "@/app/lib/markdownActions";
import type { NoteTemplate } from "@/app/lib/templates";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onTemplate: (template: NoteTemplate) => void;
}

export default function Editor({ value, onChange, onTemplate }: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Apply an edit result: update React state, then restore the caret/selection
  // on the next frame (after React re-renders the textarea).
  const apply = (result: EditResult) => {
    onChange(result.value);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const handleWrap = (before: string, after: string, placeholder?: string) => {
    const el = textareaRef.current;
    if (el) apply(wrapSelection(el, before, after, placeholder));
  };

  const handlePrefix = (prefix: string, ordered?: boolean) => {
    const el = textareaRef.current;
    if (el) apply(prefixLines(el, prefix, ordered));
  };

  const handleInsert = (text: string) => {
    const el = textareaRef.current;
    if (el) apply(insertBlock(el, text));
  };

  // Keyboard shortcuts inside the textarea.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      handleWrap("**", "**", "bold");
    } else if (key === "i") {
      e.preventDefault();
      handleWrap("*", "*", "italic");
    } else if (key === "k") {
      e.preventDefault();
      handleWrap("[", "](url)", "text");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onWrap={handleWrap}
        onPrefix={handlePrefix}
        onInsert={handleInsert}
        onTemplate={onTemplate}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Start writing in Markdown..."
          spellCheck={false}
          className="h-full w-full flex-1 resize-none bg-transparent p-6 font-mono text-sm leading-[1.8] text-text-primary placeholder:text-text-muted outline-none"
        />
        <div className="pointer-events-none absolute bottom-3 right-4 text-xs text-text-muted">
          {value.length} chars
        </div>
      </div>
    </div>
  );
}
