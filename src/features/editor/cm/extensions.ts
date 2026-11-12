import { autocompletion, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Language, LanguageSupport, defineLanguageFacet } from "@codemirror/language";
import { GFM, parser } from "@lezer/markdown";
import { Annotation, Compartment, Prec, type Extension } from "@codemirror/state";
import { Decoration, EditorView, MatchDecorator, ViewPlugin, keymap, placeholder, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { matchSlash, slashContext, type SlashId } from "@/features/editor/cm/slashCommands";
import { editorTheme, markdownHighlight } from "@/features/editor/cm/theme";

/**
 * Markdown with GitHub's tables, task lists and strikethrough. Built from the
 * parser directly: the ready-made @codemirror/lang-markdown also pulls in
 * HTML, CSS and JavaScript parsers (for code blocks and tags) that this editor
 * does not use, and they are most of its weight.
 */
const markdownSyntax = new LanguageSupport(
  new Language(defineLanguageFacet({}), parser.configure([GFM]), [], "markdown")
);

/** Marks a change that came from outside (another device, a restored version), not from typing. */
export const External = Annotation.define<boolean>();

/** `[[wiki links]]` in the accent colour. */
const wikiLinks = (() => {
  const decorator = new MatchDecorator({
    regexp: /\[\[[^\]\n]+]]/g,
    decoration: Decoration.mark({ class: "cm-wikilink" }),
  });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = decorator.updateDeco(update, this.decorations);
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
})();

export interface BaseOptions {
  label: string;
  placeholder: string;
  /** Translated name and description of each slash command. */
  slashName: (id: SlashId) => string;
  slashHint: (id: SlashId) => string;
  onChange: (value: string) => void;
  onPickFile: () => void;
  onFiles: (files: File[]) => void;
  /** Bold, italic, link and Enter-in-a-list, which work on the whole text. */
  keys: readonly { key: string; run: (view: EditorView) => boolean }[];
}

/** Everything the editor is made of except the vim mode, which is switched at run time. */
export function baseExtensions(o: BaseOptions): Extension[] {
  const slashSource = (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos);
    const found = slashContext(line.text.slice(0, context.pos - line.from));
    if (!found) return null;
    const from = line.from + found.offset;
    const matches = matchSlash(found.query, o.slashName);
    if (matches.length === 0) return null;
    return {
      from,
      filter: false,
      options: matches.map((c) => ({
        label: o.slashName(c.id),
        detail: o.slashHint(c.id),
        apply: (view: EditorView, _completion: unknown, start: number, end: number) => {
          if (!c.insert) {
            view.dispatch({ changes: { from: start, to: end, insert: "" }, selection: { anchor: start } });
            o.onPickFile();
            return;
          }
          const { text, cursor } = c.insert(new Date());
          view.dispatch({
            changes: { from: start, to: end, insert: text },
            selection: { anchor: start + (cursor ?? text.length) },
            userEvent: "input.complete",
          });
        },
      })),
    };
  };

  return [
    history(),
    markdownSyntax,
    markdownHighlight,
    editorTheme,
    wikiLinks,
    EditorView.lineWrapping,
    placeholder(o.placeholder),
    autocompletion({ override: [slashSource], icons: false, activateOnTyping: true }),
    EditorView.contentAttributes.of({
      "aria-label": o.label,
      "aria-multiline": "true",
      tabindex: "0",
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
    }),
    Prec.high(
      keymap.of(
        o.keys.map(({ key, run }) => ({
          key,
          run: (view) => !view.composing && run(view),
          preventDefault: true,
        }))
      )
    ),
    keymap.of([...completionKeymap, ...historyKeymap, ...defaultKeymap]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !update.transactions.some((tr) => tr.annotation(External))) {
        o.onChange(update.state.doc.toString());
      }
    }),
    EditorView.domEventHandlers({
      paste(event) {
        // A copied picture comes with no text; text that comes with a file is text.
        const files = [...(event.clipboardData?.files ?? [])];
        if (files.length === 0 || event.clipboardData?.getData("text/plain")) return false;
        event.preventDefault();
        o.onFiles(files);
        return true;
      },
    }),
  ];
}

export const vimCompartment = new Compartment();
