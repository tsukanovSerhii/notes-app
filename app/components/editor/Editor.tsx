"use client";

import { useRef } from "react";
import Toolbar from "@/app/components/editor/Toolbar";
import StatusBar from "@/app/components/editor/StatusBar";
import {
  continueList,
  insertBlock,
  prefixLines,
  wrapSelection,
  type TextSelection,
} from "@/app/lib/markdownActions";
import { applyNativeEdit, readSelection } from "@/app/lib/textarea";
import type { NoteTemplate } from "@/app/lib/templates";
import type { SaveStatus } from "@/app/lib/notes/store";

interface EditorProps {
  value: string;
  saveStatus: SaveStatus;
  onChange: (value: string) => void;
  onTemplate: (template: NoteTemplate) => void;
}

type Transform = (selection: TextSelection) => TextSelection | null;

export default function Editor({
  value,
  saveStatus,
  onChange,
  onTemplate,
}: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const run = (transform: Transform): boolean => {
    const el = textareaRef.current;
    if (!el) return false;
    const next = transform(readSelection(el));
    if (!next) return false;

    if (!applyNativeEdit(el, next)) {
      onChange(next.value);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(next.selectionStart, next.selectionEnd);
      });
    }
    return true;
  };

  const wrap = (before: string, after: string, placeholder?: string) =>
    run((s) => wrapSelection(s, before, after, placeholder));
  const prefix = (p: string, ordered?: boolean) =>
    run((s) => prefixLines(s, p, ordered));
  const insert = (text: string) => run((s) => insertBlock(s, text));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!e.nativeEvent.isComposing && run(continueList)) e.preventDefault();
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;

    const shortcuts: Record<string, () => void> = {
      b: () => wrap("**", "**", "bold"),
      i: () => wrap("*", "*", "italic"),
      k: () => wrap("[", "](url)", "text"),
    };
    const action = shortcuts[e.key.toLowerCase()];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onWrap={wrap}
        onPrefix={prefix}
        onInsert={insert}
        onTemplate={onTemplate}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Start writing in Markdown..."
        aria-label="Note content"
        spellCheck={false}
        className="min-h-0 w-full flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-[1.8] text-text-primary placeholder:text-text-muted outline-none sm:p-6"
      />
      <StatusBar content={value} saveStatus={saveStatus} />
    </div>
  );
}
