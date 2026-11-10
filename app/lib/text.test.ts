import { expect, test } from "@playwright/test";
import { excerpt, getTextStats, relativeTime, toFileName, todayLocalISO } from "@/app/lib/text";

test.describe("getTextStats", () => {
  test("counts words, chars and reading time", () => {
    expect(getTextStats("")).toEqual({ words: 0, chars: 0, readingMinutes: 0 });
    expect(getTextStats("  one two\nthree ")).toMatchObject({ words: 3, readingMinutes: 1 });
    expect(getTextStats("word ".repeat(1000)).readingMinutes).toBe(5);
  });
});

test.describe("relativeTime", () => {
  const now = Date.UTC(2026, 0, 10);
  const cases: [number, string][] = [
    [now - 10_000, "just now"],
    [now - 5 * 60_000, "5 minutes ago"],
    [now - 60 * 60_000, "1 hour ago"],
    [now - 24 * 60 * 60_000, "yesterday"],
    [now - 3 * 24 * 60 * 60_000, "3 days ago"],
  ];
  for (const [ts, expected] of cases) {
    test(`formats "${expected}"`, () => {
      expect(relativeTime(ts, now)).toBe(expected);
    });
  }
});

test.describe("excerpt", () => {
  test("strips Markdown syntax", () => {
    expect(excerpt("# Title\n\n- [ ] **buy** [milk](http://x)")).toBe("Title buy milk");
  });

  test("skips a first heading that repeats the title", () => {
    expect(excerpt("# Groceries\n\nmilk", 80, "Groceries")).toBe("milk");
    expect(excerpt("# Other\n\nmilk", 80, "Groceries")).toBe("Other milk");
  });

  test("drops fenced code and truncates", () => {
    expect(excerpt("```js\nconst a = 1;\n```\nhello")).toBe("hello");
    expect(excerpt("a".repeat(100), 10)).toBe("aaaaaaaaa…");
  });
});

test.describe("toFileName", () => {
  test("removes characters that are invalid in file names", () => {
    expect(toFileName('  My: "plan" / v2? ', "pdf")).toBe("My plan v2.pdf");
  });

  test("falls back to note", () => {
    expect(toFileName("   ", "md")).toBe("note.md");
    expect(toFileName(undefined, "md")).toBe("note.md");
  });
});

test.describe("todayLocalISO", () => {
  test("uses the local date, not UTC", () => {
    expect(todayLocalISO(new Date(2026, 2, 5, 23, 59))).toBe("2026-03-05");
  });
});
