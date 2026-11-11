import { expect, test } from "@playwright/test";
import { createSearchIndex, type SearchDoc } from "@/features/library/search/searchIndex";

const doc = (id: string, title: string, content = "", tags: string[] = [], version = 1): SearchDoc => ({
  id,
  title,
  content,
  tags,
  version,
});

const docs = [
  doc("a", "Quarterly budget", "Numbers for the finance team"),
  doc("b", "Meeting notes", "We discussed the budget briefly"),
  doc("c", "Groceries", "milk bread", ["shopping"]),
  doc("u", "Рецепт борщу", "буряк капуста картопля", ["їжа"]),
];

test("finds notes by any word, ranking title matches above text matches", () => {
  const index = createSearchIndex();
  index.sync(docs);
  expect(index.search("budget")).toEqual(["a", "b"]);
  expect(index.search("finance team")).toEqual(["a"]);
  expect(index.search("   ")).toEqual([]);
});

test("matches prefixes and forgives a typo in longer words", () => {
  const index = createSearchIndex();
  index.sync(docs);
  expect(index.search("quart")).toEqual(["a"]);
  expect(index.search("grocries")).toEqual(["c"]);
  // Short words are exact: no fuzzy noise.
  expect(index.search("mik")).toEqual([]);
});

test("searches tags, with or without the #, and non-Latin text", () => {
  const index = createSearchIndex();
  index.sync(docs);
  expect(index.search("#shopping")).toEqual(["c"]);
  expect(index.search("shopping")).toEqual(["c"]);
  expect(index.search("борщ")).toEqual(["u"]);
  expect(index.search("капуста")).toEqual(["u"]);
  expect(index.search("їжа")).toEqual(["u"]);
});

test("sync adds, replaces changed and drops removed notes", () => {
  const index = createSearchIndex();
  index.sync(docs);
  index.sync([
    doc("a", "Quarterly budget", "Numbers", [], 1), // unchanged
    doc("b", "Meeting notes", "now about hiring", [], 2), // changed
    doc("n", "New note", "budget again", [], 1), // added; c and u dropped
  ]);
  expect(index.size).toBe(3);
  expect(index.search("budget").sort()).toEqual(["a", "n"]);
  expect(index.search("hiring")).toEqual(["b"]);
  expect(index.search("groceries")).toEqual([]);
});

test("apply takes deltas, and re-adding an unchanged version is a no-op", () => {
  const index = createSearchIndex();
  index.apply(docs, []);
  index.apply([doc("c", "Groceries", "milk bread", ["shopping"], 1)], []);
  expect(index.size).toBe(4);
  index.apply([doc("c", "Groceries", "eggs", ["shopping"], 2)], ["a"]);
  expect(index.search("eggs")).toEqual(["c"]);
  expect(index.search("milk")).toEqual([]);
  expect(index.search("quarterly")).toEqual([]);
});
