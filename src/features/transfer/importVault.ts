import { normalizeTag } from "@/features/notes/model/schema";

/**
 * Importing a folder of Markdown files exported from Obsidian or Notion (or
 * any plain folder of notes) into notes, folders and tags. Pure: it works on
 * file paths and text, so the browser plumbing stays out of it.
 */

export interface VaultFile {
  /** Path inside the picked folder, with "/" separators (the folder's own name comes first). */
  path: string;
  text: string;
}

export interface VaultNote {
  title: string;
  content: string;
  tags: string[];
  /** Folders from the top, e.g. ["Projects", "Web"]. Empty for a note at the root. */
  folderPath: string[];
}

export interface VaultResult {
  notes: VaultNote[];
  source: "obsidian" | "notion" | "plain";
  /** Files that were not Markdown notes (attachments, settings) or were too large. */
  skipped: number;
}

export const MAX_VAULT_FILES = 3000;
export const MAX_VAULT_FILE_BYTES = 2 * 1024 * 1024;

const MARKDOWN = /\.(md|markdown|mdown)$/i;
/** Notion appends a 32-character id to every exported file and folder name. */
const NOTION_ID = /\s+[0-9a-f]{32}(?=\.[A-Za-z]+$|$)/i;

const stripNotionId = (name: string) => name.replace(NOTION_ID, "");

/** The `---` block at the top of a file, and what is left after it. */
export function splitFrontmatter(text: string): { yaml: string; body: string } {
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  return m ? { yaml: m[1], body: text.slice(m[0].length) } : { yaml: "", body: text };
}

/** Tags from the `tags:` or `tag:` property in all the forms Obsidian writes. */
export function frontmatterTags(yaml: string): string[] {
  const lines = yaml.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:tags?)\s*:\s*(.*)$/i.exec(lines[i]);
    if (!m) continue;
    const inline = m[1].trim();
    if (inline) {
      out.push(...inline.replace(/^\[|\]$/g, "").split(/[,\s]+/));
    } else {
      for (let j = i + 1; j < lines.length; j++) {
        const item = /^\s*-\s*(.+?)\s*$/.exec(lines[j]);
        if (!item) break;
        out.push(item[1]);
      }
    }
  }
  return out.map((t) => t.replace(/^["']|["']$/g, ""));
}

/** `#tag` words outside code; a heading's "# " has a space and does not count. */
export function inlineTags(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?(?:```|$)/g, " ").replace(/`[^`\n]*`/g, " ");
  const out: string[] = [];
  for (const m of prose.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu)) out.push(m[1]);
  return out;
}

/**
 * Obsidian-specific link forms reduced to `[[Title]]` / `[[Title|text]]`:
 * embeds become links, `#Heading` and `^block` parts are dropped, and a path
 * (`[[Projects/Plan]]`) keeps only the note name, since links here go by title.
 */
export function normalizeObsidianLinks(markdown: string): string {
  return markdown
    .replace(/!\[\[/g, "[[")
    .replace(/\[\[([^[\]|#^\n]+)(?:[#^][^[\]|\n]*)?(?:\|([^[\]\n]+))?]]/g, (_all, target: string, shown?: string) => {
      const title = (target.split("/").pop() ?? target).trim();
      return shown ? `[[${title}|${shown}]]` : `[[${title}]]`;
    });
}

/** Notion links between pages: `[text](Page%20Name%20<id>.md)` → `[[Page Name|text]]`. */
export function convertNotionLinks(markdown: string): string {
  return markdown.replace(/(?<!!)\[([^\]\n]*)\]\(([^)\s]+\.md)\)/g, (all, text: string, href: string) => {
    if (/^[a-z]+:\/\//i.test(href)) return all;
    let decoded: string;
    try {
      decoded = decodeURIComponent(href);
    } catch {
      return all;
    }
    const file = decoded.split("/").pop() ?? decoded;
    const title = stripNotionId(file.replace(/\.md$/i, "")).trim();
    if (!title) return all;
    return text.trim() && text.trim() !== title ? `[[${title}|${text.trim()}]]` : `[[${title}]]`;
  });
}

export function parseVault(files: readonly VaultFile[]): VaultResult {
  const candidates = files.filter((f) => MARKDOWN.test(f.path) && !/(^|\/)\.[^/]+\//.test(f.path));
  const usable = candidates.filter((f) => f.text.length <= MAX_VAULT_FILE_BYTES).slice(0, MAX_VAULT_FILES);
  const skipped = files.length - usable.length;

  const notionIds = usable.filter((f) => NOTION_ID.test(f.path.split("/").pop() ?? "")).length;
  const source: VaultResult["source"] =
    usable.length > 0 && notionIds / usable.length > 0.5
      ? "notion"
      : usable.some((f) => /\[\[[^\]\n]+]]/.test(f.text) || /^---\n[\s\S]*?\n---/.test(f.text))
        ? "obsidian"
        : "plain";

  const used = new Map<string, number>();
  const notes: VaultNote[] = usable.map((file) => {
    const segments = file.path.split("/").filter(Boolean);
    const fileName = segments.pop() ?? "Untitled.md";
    segments.shift(); // the picked folder's own name
    const folderPath = (source === "notion" ? segments.map(stripNotionId) : segments).map((s) => s.trim());

    const text = file.text.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
    const { yaml, body } = splitFrontmatter(text);
    let content = source === "notion" ? convertNotionLinks(body) : normalizeObsidianLinks(body);

    let title = fileName.replace(MARKDOWN, "");
    if (source === "notion") title = stripNotionId(title);
    title = title.trim() || "Untitled";
    // A leading "# Title" that only repeats the title is noise in the list and the preview.
    const first = /^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/.exec(content);
    if (first && first[1].trim().toLowerCase() === title.toLowerCase()) content = content.slice(first[0].length).replace(/^\n+/, "");

    const key = `${folderPath.join("/")}\u0000${title.toLowerCase()}`;
    const seen = used.get(key) ?? 0;
    used.set(key, seen + 1);
    if (seen > 0) title = `${title} (${seen + 1})`;

    const tags = [...new Set([...frontmatterTags(yaml), ...inlineTags(content)].map(normalizeTag).filter(Boolean))];
    return { title: title.slice(0, 200), content, tags, folderPath };
  });

  return { notes, source, skipped };
}
