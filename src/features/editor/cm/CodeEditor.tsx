"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { EditorState, Prec, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { External, baseExtensions, vimCompartment } from "@/features/editor/cm/extensions";
import type { SlashId } from "@/features/editor/cm/slashCommands";
import type { TextSelection } from "@/features/editor/lib/markdownActions";

export interface EditorHandle {
  /**
   * Applies a pure text edit (bold, list, table...) to the selection as one
   * undoable change. Returns false when the edit does not apply.
   */
  transform(fn: (selection: TextSelection) => TextSelection | null): boolean;
  /** Puts the caret at `offset` and scrolls it to the top of the editor. */
  reveal(offset: number): void;
  focus(): void;
}

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  vim: boolean;
  slashName: (id: SlashId) => string;
  slashHint: (id: SlashId) => string;
  onPickFile: () => void;
  onFiles: (files: File[]) => void;
  /** Editing keys that need the toolbar's logic (bold, italic, link, Enter in lists). */
  onKey: (key: "bold" | "italic" | "link" | "enter") => ((s: TextSelection) => TextSelection | null) | null;
  handleRef: Ref<EditorHandle>;
}

/** The smallest single replacement that turns `before` into `after`. */
function diff(before: string, after: string) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  return { from: start, to: endBefore, insert: after.slice(start, endAfter) };
}

/**
 * A CodeMirror 6 editor for Markdown. `value` is the source of truth: edits
 * made by typing go out through `onChange`, and a different `value` coming in
 * (sync, a restored version, a template) replaces the text without touching
 * the undo history.
 */
export default function CodeEditor(props: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Callbacks change on every render; the editor is built once and reads them from here.
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const transform: EditorHandle["transform"] = (fn) => {
    const v = view.current;
    if (!v) return false;
    const sel = v.state.selection.main;
    const next = fn({ value: v.state.doc.toString(), selectionStart: sel.from, selectionEnd: sel.to });
    if (!next) return false;
    const change = diff(v.state.doc.toString(), next.value);
    v.dispatch({
      changes: change,
      selection: { anchor: next.selectionStart, head: next.selectionEnd },
      scrollIntoView: true,
      userEvent: "input",
    });
    v.focus();
    return true;
  };

  useImperativeHandle(props.handleRef, () => ({
    transform,
    reveal(offset) {
      const v = view.current;
      if (!v) return;
      const at = Math.min(offset, v.state.doc.length);
      v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: "start", yMargin: 12 }) });
      v.focus();
    },
    focus: () => view.current?.focus(),
  }));

  useEffect(() => {
    if (!host.current) return;
    const key = (name: "bold" | "italic" | "link" | "enter") => (v: EditorView) => {
      const fn = latest.current.onKey(name);
      if (!fn) return false;
      const sel = v.state.selection.main;
      const next = fn({ value: v.state.doc.toString(), selectionStart: sel.from, selectionEnd: sel.to });
      if (!next) return false;
      v.dispatch({
        changes: diff(v.state.doc.toString(), next.value),
        selection: { anchor: next.selectionStart, head: next.selectionEnd },
        scrollIntoView: true,
        userEvent: "input",
      });
      return true;
    };
    const first = latest.current;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: first.value,
        extensions: [
          vimCompartment.of([]),
          baseExtensions({
            label: first.label,
            placeholder: first.placeholder,
            slashName: (id) => latest.current.slashName(id),
            slashHint: (id) => latest.current.slashHint(id),
            onChange: (v) => latest.current.onChange(v),
            onPickFile: () => latest.current.onPickFile(),
            onFiles: (files) => latest.current.onFiles(files),
            keys: [
              { key: "Mod-b", run: key("bold") },
              { key: "Mod-i", run: key("italic") },
              { key: "Mod-k", run: key("link") },
              { key: "Enter", run: key("enter") },
            ],
          }),
        ],
      }),
    });
    view.current = editor;
    // The editor is drawn in the monospace font. Until it has loaded the text
    // is laid out in a fallback, and swapping fonts would shift every line, so
    // it stays hidden (hidden things do not count as layout shifts) until then.
    const dom = host.current;
    dom.style.visibility = "hidden";
    const show = () => {
      dom.style.visibility = "";
      editor.requestMeasure();
    };
    // Two frames: the editor mounts its styles and measures itself after the first.
    const showSoon = () => requestAnimationFrame(() => requestAnimationFrame(show));
    const family = getComputedStyle(editor.scrollDOM).fontFamily;
    const timeout = setTimeout(show, 1500);
    void Promise.resolve(document.fonts?.load(`14px ${family}`))
      .catch(() => undefined)
      .then(() => {
        clearTimeout(timeout);
        showSoon();
      });
    return () => {
      clearTimeout(timeout);
      editor.destroy();
      view.current = null;
    };
  }, []);

  // Text that changed outside the editor.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current === props.value) return;
    v.dispatch({
      changes: diff(current, props.value),
      annotations: [External.of(true), Transaction.addToHistory.of(false)],
    });
  }, [props.value]);

  // Vim keys are a separate chunk, loaded only when switched on.
  useEffect(() => {
    let cancelled = false;
    const v = view.current;
    if (!v) return;
    if (!props.vim) {
      v.dispatch({ effects: vimCompartment.reconfigure([]) });
      return;
    }
    void import("@replit/codemirror-vim").then(({ vim }) => {
      if (!cancelled && view.current) {
        view.current.dispatch({ effects: vimCompartment.reconfigure(Prec.high(vim())) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props.vim]);

  return <div ref={host} className="h-full min-h-0" />;
}
