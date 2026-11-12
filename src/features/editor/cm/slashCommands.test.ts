import { expect, test } from "@playwright/test";
import { SLASH_COMMANDS, matchSlash, slashContext } from "@/features/editor/cm/slashCommands";

const name = (id: string) => (id === "heading1" ? "Заголовок 1" : id);

test("a slash at the start of a line or after a space starts a command", () => {
  expect(slashContext("/")).toEqual({ offset: 0, query: "" });
  expect(slashContext("/head")).toEqual({ offset: 0, query: "head" });
  expect(slashContext("text /ta")).toEqual({ offset: 5, query: "ta" });
  expect(slashContext("  /h1")).toEqual({ offset: 2, query: "h1" });
  expect(slashContext("/заг")).toEqual({ offset: 0, query: "заг" });
});

test("a slash inside a word, a URL or a path does not", () => {
  expect(slashContext("a/b")).toBeNull();
  expect(slashContext("https://example.com/pa")).toBeNull();
  expect(slashContext("and/or")).toBeNull();
  expect(slashContext("no slash")).toBeNull();
  expect(slashContext("/done and more")).toBeNull();
});

test("commands are found by translated name, id or keyword, in their usual order", () => {
  expect(matchSlash("", name)).toHaveLength(SLASH_COMMANDS.length);
  expect(matchSlash("заг", name).map((c) => c.id)).toEqual(["heading1"]);
  expect(matchSlash("h2", name).map((c) => c.id)).toEqual(["heading2"]);
  expect(matchSlash("LIST", name).map((c) => c.id)).toEqual(["bullet", "numbered"]);
  expect(matchSlash("zzzz", name)).toEqual([]);
});

test("insertions put the caret where text is expected next", () => {
  const code = SLASH_COMMANDS.find((c) => c.id === "code")!.insert!(new Date());
  expect(code.text.slice(0, code.cursor)).toBe("```\n");
  const link = SLASH_COMMANDS.find((c) => c.id === "link")!.insert!(new Date());
  expect(link.text.slice(0, link.cursor)).toBe("[");
  const date = SLASH_COMMANDS.find((c) => c.id === "date")!.insert!(new Date(2025, 0, 9));
  expect(date.text).toBe("2025-01-09");
  expect(SLASH_COMMANDS.find((c) => c.id === "file")!.insert).toBeUndefined();
});
