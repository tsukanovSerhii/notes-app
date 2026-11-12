"use client";

import { useRef } from "react";
import Toolbar from "@/features/editor/Toolbar";
import StatusBar from "@/features/editor/StatusBar";
import {
  continueList,
  insertBlock,
  prefixLines,
  wrapSelection,
  type TextSelection,
} from "@/features/editor/lib/markdownActions";
import { applyNativeEdit, readSelection } from "@/features/editor/lib/textarea";
import type { NoteTemplate } from "@/features/editor/lib/templates";
import type { SaveStatus } from "@/features/notes/state/store";
import { useI18n } from "@/shared/i18n";

interface EditorProps {
  value: string;
  saveStatus: SaveStatus;
  onChange: (value: string) => void;
  onTemplate: (template: NoteTemplate) => void;
  /** Stores files and returns the Markdown that shows them ("" if none were added). */
  onAttach: (files: File[]) => Promise<string>;
}

type Transform = (selection: TextSelection) => TextSelection | null;

export default function Editor({
  value,
  saveStatus,
  onChange,
  onTemplate,
  onAttach,
}: EditorProps) {
  const { t } = useI18n();
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

  const attach = async (files: File[]) => {
    const markdown = await onAttach(files);
    if (markdown) insert(markdown);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Copied text may come with a picture of it; only files alone are attached.
    const files = [...e.clipboardData.files];
    if (files.length === 0 || e.clipboardData.getData("text/plain")) return;
    e.preventDefault();
    void attach(files);
  };

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
        onAttach={(files) => void attach(files)}
      />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={t.note.placeholder}
        aria-label={t.note.content}
        spellCheck={false}
        className="min-h-0 w-full flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-[1.8] text-text-primary placeholder:text-text-muted outline-none sm:p-6"
      />
      <StatusBar content={value} saveStatus={saveStatus} />
    </div>
  );
}
