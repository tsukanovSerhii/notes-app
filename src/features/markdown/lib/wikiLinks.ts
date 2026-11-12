import type { Note } from "@/features/notes/model/types";

/** `[[Title]]` or `[[Title|shown text]]`. */
const WIKI_LINK = /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]+?))?]]/g;

/** Wiki links render as fragment links, so no new URL scheme is needed. */
export const NOTE_HREF_PREFIX = "#note=";

export const noteHref = (title: string) => NOTE_HREF_PREFIX + encodeURIComponent(title.trim());

export function titleFromHref(href: string | undefined): string | null {
  if (!href?.startsWith(NOTE_HREF_PREFIX)) return null;
  try {
    return decodeURIComponent(href.slice(NOTE_HREF_PREFIX.length));
  } catch {
    return null;
  }
}

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The note a link points to: a live note whose title matches, ignoring case. */
export function findNoteByTitle(notes: readonly Note[], title: string): Note | null {
  return notes.find((n) => n.trashedAt === null && sameTitle(n.title, title)) ?? null;
}

/** Titles a note links to, outside code. */
export function wikiTargets(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?(```|$)/g, " ").replace(/`[^`\n]*`/g, " ");
  const out = new Set<string>();
  for (const m of prose.matchAll(WIKI_LINK)) out.add(m[1].trim());
  return [...out];
}

/**
 * What each note links to, lower-cased, remembered per note object. An edit
 * creates a new object for the edited note only, so typing in one note does
 * not re-read the text of every other note.
 */
const linkCache = new WeakMap<object, string[]>();

function linksOf(note: Note): string[] {
  let links = linkCache.get(note);
  if (!links) {
    // Most notes have no links at all; skip the code-stripping regexes for them.
    links = note.content.includes("[[") ? wikiTargets(note.content).map((t) => t.trim().toLowerCase()) : [];
    linkCache.set(note, links);
  }
  return links;
}

/** Live notes, other than `target`, that link to it. */
export function backlinks(notes: readonly Note[], target: Pick<Note, "id" | "title">): Note[] {
  const title = target.title.trim().toLowerCase();
  if (!title) return [];
  return notes.filter((n) => n.id !== target.id && n.trashedAt === null && linksOf(n).includes(title));
}

/**
 * Points every `[[Old]]` and `[[Old|text]]` link outside code at `newTitle`,
 * keeping any shown text. Returns the same string when nothing matched.
 */
export function renameLinkTarget(markdown: string, oldTitle: string, newTitle: string): string {
  const next = newTitle.trim();
  if (!oldTitle.trim() || !next || sameTitle(oldTitle, next)) return markdown;
  // Odd entries of the split are code spans and fenced blocks: left as written.
  const parts = markdown.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/);
  return parts
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(WIKI_LINK, (all, target: string, shown: string | undefined) =>
            sameTitle(target, oldTitle) ? `[[${next}${shown !== undefined ? `|${shown}` : ""}]]` : all
          )
    )
    .join("");
}

// --- remark plugin -------------------------------------------------------

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdNode[];
}

function splitText(value: string): MdNode[] | null {
  WIKI_LINK.lastIndex = 0;
  if (!WIKI_LINK.test(value)) return null;
  WIKI_LINK.lastIndex = 0;
  const out: MdNode[] = [];
  let from = 0;
  for (const m of value.matchAll(WIKI_LINK)) {
    if (m.index > from) out.push({ type: "text", value: value.slice(from, m.index) });
    const target = m[1].trim();
    out.push({
      type: "link",
      url: noteHref(target),
      title: null,
      children: [{ type: "text", value: (m[2] ?? m[1]).trim() }],
    });
    from = m.index + m[0].length;
  }
  if (from < value.length) out.push({ type: "text", value: value.slice(from) });
  return out;
}

function transform(node: MdNode) {
  if (!node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    // Code nodes keep their text as is; links cannot nest.
    if (child.type === "text" && child.value) {
      const parts = splitText(child.value);
      if (parts) {
        next.push(...parts);
        continue;
      }
    } else if (child.type !== "link" && child.type !== "linkReference") {
      transform(child);
    }
    next.push(child);
  }
  node.children = next;
}

/** Turns `[[Title]]` in Markdown text into links to the note titled "Title". */
export function remarkWikiLinks() {
  return (tree: unknown) => transform(tree as MdNode);
}
