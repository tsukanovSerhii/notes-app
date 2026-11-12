export interface Heading {
  level: number;
  text: string;
  /** Zero-based line the heading is on. */
  line: number;
  /** Character offset of the start of that line. */
  offset: number;
  /** How many earlier headings have the same text; tells repeated titles apart. */
  occurrence: number;
}

/** Heading text as it is shown: inline Markdown syntax removed. */
function plain(text: string): string {
  return text
    .replace(/!?\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?]]/g, (_m, target: string, label?: string) => label ?? target)
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The headings of a Markdown text (`#` style), in order. Lines inside fenced
 * code blocks are not headings.
 */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  let fence: string | null = null;
  let offset = 0;
  const lines = markdown.split("\n");
  for (let line = 0; line < lines.length; line++) {
    const raw = lines[line];
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(raw)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0];
      else if (marker[0] === fence) fence = null;
    } else if (fence === null) {
      const m = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(raw.replace(/\r$/, ""));
      const text = m ? plain(m[2]) : "";
      if (m && text) {
        const occurrence = seen.get(text) ?? 0;
        seen.set(text, occurrence + 1);
        headings.push({ level: m[1].length, text, line, offset, occurrence });
      }
    }
    offset += raw.length + 1;
  }
  return headings;
}

/** Scrolls the rendered preview (if it is on screen) to the same heading. */
export function scrollPreviewTo(heading: Heading): void {
  const same = [...document.querySelectorAll("#preview-content :is(h1, h2, h3, h4, h5, h6)")].filter(
    (el) => el.textContent?.replace(/\s+/g, " ").trim() === heading.text
  );
  same[heading.occurrence]?.scrollIntoView({ block: "start" });
}
