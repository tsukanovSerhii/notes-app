import { expect, test } from "@playwright/test";
import {
  backlinks,
  findNoteByTitle,
  noteHref,
  remarkWikiLinks,
  titleFromHref,
  wikiTargets,
} from "@/app/lib/wikiLinks";
import { note } from "@/app/lib/notes/testUtils";

test("wikiTargets finds [[links]] outside code, once each", () => {
  const md = "See [[Plan]] and [[Budget|the money]].\n\n`[[not this]]`\n\n```\n[[nor this]]\n```\nAgain [[plan ]]";
  expect(wikiTargets(md)).toEqual(["Plan", "Budget", "plan"]);
});

test("hrefs round-trip titles, including unusual characters", () => {
  for (const title of ["Plan", "Q&A / 2026", "Нотатка #1"]) {
    expect(titleFromHref(noteHref(title))).toBe(title);
  }
  expect(titleFromHref("https://example.com")).toBeNull();
  expect(titleFromHref("#note=%E0%A4%A")).toBeNull();
});

test("links match titles case-insensitively and skip the trash", () => {
  const notes = [note("a", { title: "Plan" }), note("b", { title: "Old", trashedAt: 1 })];
  expect(findNoteByTitle(notes, " plan ")?.id).toBe("a");
  expect(findNoteByTitle(notes, "Old")).toBeNull();
});

test("backlinks lists the live notes that link to a note", () => {
  const target = note("t", { title: "Plan" });
  const notes = [
    target,
    note("a", { content: "see [[plan]]" }),
    note("b", { content: "see [[Plan|the plan]]" }),
    note("c", { content: "no link here" }),
    note("d", { content: "[[Plan]]", trashedAt: 1 }),
    note("e", { content: "`[[Plan]]` in code" }),
  ];
  expect(backlinks(notes, target).map((n) => n.id)).toEqual(["a", "b"]);
});

test("the remark plugin turns [[links]] into link nodes, leaving code alone", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "Go to [[Plan|the plan]] now" },
          { type: "inlineCode", value: "[[Plan]]" },
        ],
      },
    ],
  };
  remarkWikiLinks()(tree);
  expect(tree.children[0].children).toEqual([
    { type: "text", value: "Go to " },
    { type: "link", url: "#note=Plan", title: null, children: [{ type: "text", value: "the plan" }] },
    { type: "text", value: " now" },
    { type: "inlineCode", value: "[[Plan]]" },
  ]);
});
