import { expect, test } from "@playwright/test";
import { extractHeadings } from "@/features/editor/lib/outline";

test("headings come with their level, line and offset", () => {
  const md = "# Title\n\nText\n\n## Part one\n### Deeper ###\n";
  expect(extractHeadings(md)).toEqual([
    { level: 1, text: "Title", line: 0, offset: 0, occurrence: 0 },
    { level: 2, text: "Part one", line: 4, offset: 15, occurrence: 0 },
    { level: 3, text: "Deeper", line: 5, offset: 27, occurrence: 0 },
  ]);
});

test("lines in code blocks, hashtags and empty headings are not headings", () => {
  const md = "```md\n# not a heading\n```\n#hashtag\n#\n~~~\n## nor this\n~~~\n## Real";
  expect(extractHeadings(md).map((h) => h.text)).toEqual(["Real"]);
});

test("inline Markdown is removed from the text", () => {
  const md = "## A **bold** [link](https://x.y) and `code` with [[Note|alias]]";
  expect(extractHeadings(md)[0].text).toBe("A bold link and code with alias");
});

test("repeated titles are numbered so each can be found", () => {
  const md = "## Notes\n\n## Notes\n\n## Other\n\n## Notes";
  expect(extractHeadings(md).map((h) => h.occurrence)).toEqual([0, 1, 0, 2]);
});

test("Windows line endings are handled", () => {
  expect(extractHeadings("# One\r\n\r\n## Two\r\n").map((h) => h.text)).toEqual(["One", "Two"]);
});
