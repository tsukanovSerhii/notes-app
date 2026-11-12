"use client";

import { lazy, Suspense, useRef } from "react";
import Toolbar from "@/features/editor/Toolbar";
import StatusBar from "@/features/editor/StatusBar";
import {
  continueList,
  insertBlock,
  prefixLines,
  wrapSelection,
  type TextSelection,
} from "@/features/editor/lib/markdownActions";
import type { EditorHandle } from "@/features/editor/cm/CodeEditor";
import { VIM_PREFERENCE, isVimSetting } from "@/features/editor/lib/vimSetting";
import { scrollPreviewTo, type Heading } from "@/features/editor/lib/outline";
import type { NoteTemplate } from "@/features/editor/lib/templates";
import type { SaveStatus } from "@/features/notes/state/store";
import { usePreference } from "@/shared/hooks/usePreference";
import { useI18n } from "@/shared/i18n";

// CodeMirror is a sizeable chunk; the page paints before it arrives.
const CodeEditor = lazy(() => import("@/features/editor/cm/CodeEditor"));

interface EditorProps {
  value: string;
  saveStatus: SaveStatus;
  onChange: (value: string) => void;
  templates: NoteTemplate[];
  onTemplate: (template: NoteTemplate) => void;
  onSaveTemplate: () => void;
  /** Stores files and returns the Markdown that shows them ("" if none were added). */
  onAttach: (files: File[]) => Promise<string>;
}

type Transform = (selection: TextSelection) => TextSelection | null;

export default function Editor({
  value,
  saveStatus,
  onChange,
  templates,
  onTemplate,
  onSaveTemplate,
  onAttach,
}: EditorProps) {
  const { t } = useI18n();
  const [vim] = usePreference(VIM_PREFERENCE, "off", isVimSetting);
  const editor = useRef<EditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = (transform: Transform): boolean => editor.current?.transform(transform) ?? false;

  const wrap = (before: string, after: string, placeholder?: string) =>
    run((s) => wrapSelection(s, before, after, placeholder));
  const prefix = (p: string, ordered?: boolean) => run((s) => prefixLines(s, p, ordered));
  const insert = (text: string) => run((s) => insertBlock(s, text));

  const attach = async (files: File[]) => {
    const markdown = await onAttach(files);
    if (markdown) insert(markdown);
  };

  const jump = (heading: Heading) => {
    editor.current?.reveal(heading.offset);
    scrollPreviewTo(heading);
  };

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        onWrap={wrap}
        onPrefix={prefix}
        onInsert={insert}
        templates={templates}
        onTemplate={onTemplate}
        onSaveTemplate={onSaveTemplate}
        onPickFile={() => fileInput.current?.click()}
        content={value}
        onJump={jump}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        data-testid="attach-input"
        aria-label={t.editor.attach}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void attach(files);
        }}
      />
      <div className="min-h-0 flex-1" data-testid="editor">
        <Suspense fallback={<div className="h-full" aria-busy="true" />}>
          <CodeEditor
            value={value}
            onChange={onChange}
            label={t.note.content}
            placeholder={t.note.placeholder}
            vim={vim === "on"}
            slashName={(id) => t.slash[id]}
            slashHint={(id) => t.slashHint[id]}
            onPickFile={() => fileInput.current?.click()}
            onFiles={(files) => void attach(files)}
            onKey={(name) =>
              name === "bold"
                ? (s) => wrapSelection(s, "**", "**", "bold")
                : name === "italic"
                  ? (s) => wrapSelection(s, "*", "*", "italic")
                  : name === "link"
                    ? (s) => wrapSelection(s, "[", "](url)", "text")
                    : continueList
            }
            handleRef={editor}
          />
        </Suspense>
      </div>
      <StatusBar content={value} saveStatus={saveStatus} />
    </div>
  );
}
