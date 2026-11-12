import { todayLocalISO } from "@/shared/lib/text";

export type SlashId =
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "numbered"
  | "task"
  | "quote"
  | "code"
  | "table"
  | "divider"
  | "link"
  | "wikiLink"
  | "date"
  | "math"
  | "diagram"
  | "file";

export interface SlashCommand {
  id: SlashId;
  /** Words (besides the translated name) that find the command, e.g. `h1`. */
  keywords: string[];
  /** The text to put in place of the slash; `cursor` is where the caret goes in it. */
  insert?: (now: Date) => { text: string; cursor?: number };
}

const TABLE = "| Column A | Column B |\n| --- | --- |\n| cell | cell |\n";

/** The block commands offered after typing `/`. `file` opens the file picker instead of inserting. */
export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "heading1", keywords: ["h1", "title", "#"], insert: () => ({ text: "# " }) },
  { id: "heading2", keywords: ["h2", "##"], insert: () => ({ text: "## " }) },
  { id: "heading3", keywords: ["h3", "###"], insert: () => ({ text: "### " }) },
  { id: "bullet", keywords: ["ul", "list", "-"], insert: () => ({ text: "- " }) },
  { id: "numbered", keywords: ["ol", "list", "1."], insert: () => ({ text: "1. " }) },
  { id: "task", keywords: ["todo", "checkbox", "[ ]"], insert: () => ({ text: "- [ ] " }) },
  { id: "quote", keywords: ["blockquote", ">"], insert: () => ({ text: "> " }) },
  { id: "code", keywords: ["snippet", "```"], insert: () => ({ text: "```\n\n```\n", cursor: 4 }) },
  { id: "table", keywords: ["grid"], insert: () => ({ text: TABLE }) },
  { id: "divider", keywords: ["hr", "rule", "---"], insert: () => ({ text: "---\n" }) },
  { id: "link", keywords: ["url", "href"], insert: () => ({ text: "[](url)", cursor: 1 }) },
  { id: "wikiLink", keywords: ["note", "[["], insert: () => ({ text: "[[]]", cursor: 2 }) },
  { id: "date", keywords: ["today", "time"], insert: (now) => ({ text: todayLocalISO(now) }) },
  { id: "math", keywords: ["latex", "katex", "$$"], insert: () => ({ text: "$$\n\n$$\n", cursor: 3 }) },
  { id: "diagram", keywords: ["mermaid", "chart", "graph"], insert: () => ({ text: "```mermaid\n\n```\n", cursor: 12 }) },
  { id: "file", keywords: ["image", "picture", "attach", "upload"] },
];

/**
 * Where a slash command is being typed: a `/` at the start of a line or after
 * whitespace, followed by letters. Returns the slash position and what was
 * typed after it, or null. (A `/` inside a word, as in a URL, is not a command.)
 */
export function slashContext(lineBefore: string): { offset: number; query: string } | null {
  const m = /(^|\s)\/([\p{L}\p{N}#\-.[\]$>`]*)$/u.exec(lineBefore);
  if (!m) return null;
  return { offset: m.index + m[1].length, query: m[2] };
}

/** The commands matching what was typed, in their usual order. `name` is the translated label. */
export function matchSlash(
  query: string,
  name: (id: SlashId) => string,
  commands: readonly SlashCommand[] = SLASH_COMMANDS
): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...commands];
  return commands.filter((c) => [name(c.id), c.id, ...c.keywords].some((w) => w.toLowerCase().includes(q)));
}
