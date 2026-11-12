import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/** Layout and colours of the editor, from the app's CSS variables (so both themes work). */
export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--text-primary)",
    fontSize: "0.875rem",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono), ui-monospace, monospace",
    lineHeight: "1.8",
    overflow: "auto",
  },
  ".cm-content": { padding: "1rem 1.5rem", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-glow)",
  },
  ".cm-placeholder": { color: "var(--text-muted)" },
  ".cm-wikilink": { color: "var(--accent)" },
  ".cm-tooltip": {
    border: "1px solid var(--border)",
    backgroundColor: "var(--bg-elevated)",
    color: "var(--text-primary)",
    borderRadius: "0.5rem",
    overflow: "hidden",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.35)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-sans), system-ui, sans-serif",
    maxHeight: "16rem",
  },
  ".cm-tooltip-autocomplete ul li": { padding: "0.3rem 0.75rem", display: "flex", gap: "0.75rem" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent-glow)",
    color: "var(--accent)",
  },
  ".cm-completionDetail": { marginLeft: "auto", color: "var(--text-muted)", fontStyle: "normal" },
  ".cm-completionIcon": { display: "none" },
  ".cm-vim-panel": {
    fontFamily: "var(--font-mono), monospace",
    backgroundColor: "var(--bg-elevated)",
    color: "var(--text-primary)",
    padding: "0.15rem 0.75rem",
  },
  ".cm-fat-cursor": { backgroundColor: "var(--accent) !important", color: "var(--bg-base) !important" },
});

/** Markdown syntax colouring. Marks (`#`, `**`) are dimmed, content keeps its colour. */
export const markdownHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading, color: "var(--accent)", fontWeight: "700" },
    { tag: t.strong, fontWeight: "700", color: "var(--text-primary)" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through", color: "var(--text-muted)" },
    { tag: t.link, color: "var(--accent)" },
    { tag: t.url, color: "var(--text-muted)", textDecoration: "underline" },
    { tag: t.monospace, color: "var(--accent)" },
    { tag: t.quote, color: "var(--text-secondary)", fontStyle: "italic" },
    { tag: t.processingInstruction, color: "var(--text-muted)" },
    { tag: t.contentSeparator, color: "var(--text-muted)" },
    { tag: t.meta, color: "var(--text-muted)" },
  ])
);
