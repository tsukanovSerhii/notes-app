const WORDS_PER_MINUTE = 200;

export interface TextStats {
  words: number;
  chars: number;
  readingMinutes: number;
}

export function getTextStats(text: string): TextStats {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return {
    words,
    chars: text.length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
  };
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

const formatters = new Map<string, Intl.RelativeTimeFormat>();
const JUST_NOW: Record<string, string> = { en: "just now", uk: "щойно" };

export function relativeTime(timestamp: number, now = Date.now(), locale = "en"): string {
  const seconds = Math.round((now - timestamp) / 1000);
  const justNow = JUST_NOW[locale] ?? JUST_NOW.en;
  if (seconds < 60) return justNow;
  let formatter = formatters.get(locale);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    formatters.set(locale, formatter);
  }
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return formatter.format(-Math.floor(seconds / size), unit);
  }
  return justNow;
}

/**
 * Plain-text preview of a note body, with Markdown syntax stripped.
 * A leading heading that just repeats the note title is skipped.
 */
export function excerpt(markdown: string, maxLength = 80, title = ""): string {
  const firstLine = /^\s*#{1,6}\s+(.*)\n?/.exec(markdown);
  const body =
    firstLine && title && firstLine[1].trim() === title.trim()
      ? markdown.slice(firstLine[0].length)
      : markdown;
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+(\[[ xX]]\s+)?/gm, "")
    .replace(/[*_~`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Markdown reduced to plain text (no syntax), for previews and search snippets. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n?/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]]+)]]/g, "$1")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+(\[[ xX]]\s+)?/gm, "")
    .replace(/[*_~`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The search query as matching uses it: trimmed, lower-cased, without a leading "#". */
export const normalizeQuery = (query: string) => query.trim().toLowerCase().replace(/^#/, "");

export interface Segment {
  text: string;
  match: boolean;
}

/** Splits `text` into matching and non-matching runs of `query` (case-insensitive). */
export function highlight(text: string, query: string): Segment[] {
  const q = normalizeQuery(query);
  if (!q) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const out: Segment[] = [];
  let from = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, at + q.length)) {
    if (at > from) out.push({ text: text.slice(from, at), match: false });
    out.push({ text: text.slice(at, at + q.length), match: true });
    from = at + q.length;
  }
  if (from < text.length) out.push({ text: text.slice(from), match: false });
  return out;
}

/**
 * A short piece of the note's text around the first match of `query`, cut at
 * word boundaries, or null if the text does not contain it.
 */
export function searchSnippet(markdown: string, query: string, radius = 36): string | null {
  const q = normalizeQuery(query);
  if (!q) return null;
  const text = plainText(markdown);
  const at = text.toLowerCase().indexOf(q);
  if (at === -1) return null;
  let start = Math.max(0, at - radius);
  let end = Math.min(text.length, at + q.length + radius);
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(" ", end) > at + q.length ? text.lastIndexOf(" ", end) : end;
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/** A safe file name for downloads; falls back to "note". */
export function toFileName(title: string | undefined, extension: string): string {
  const base = (title ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 100)
    .trim();
  return `${base || "note"}.${extension}`;
}

/** Today's date in the user's local time zone, as YYYY-MM-DD. */
export function todayLocalISO(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
