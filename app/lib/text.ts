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

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((now - timestamp) / 1000);
  if (seconds < 60) return "just now";
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      return relativeFormatter.format(-Math.floor(seconds / size), unit);
    }
  }
  return "just now";
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
