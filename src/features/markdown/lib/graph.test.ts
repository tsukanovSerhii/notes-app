import { expect, test } from "@playwright/test";
import { buildLinkGraph, GRAPH_SIZE, layoutGraph } from "@/features/markdown/lib/graph";
import { note } from "@/features/notes/testing";

const notes = [
  note("a", { title: "Alpha", content: "to [[Beta]] and [[beta]] and [[Missing]] and [[Alpha]]" }),
  note("b", { title: "Beta", content: "back to [[Alpha]] and `[[Gamma]]`" }),
  note("c", { title: "Gamma", content: "links nowhere" }),
  note("d", { title: "Delta", content: "to [[Gamma]]" }),
  note("t", { title: "Trashed", content: "[[Alpha]]", trashedAt: 5 }),
];

test("buildLinkGraph links notes by title, once, ignoring self, missing, code and the trash", () => {
  const g = buildLinkGraph(notes);
  expect(g.edges).toEqual([
    { from: "a", to: "b" },
    { from: "b", to: "a" },
    { from: "d", to: "c" },
  ]);
  expect(g.nodes.map((n) => [n.id, n.degree]).sort()).toEqual([["a", 2], ["b", 2], ["c", 1], ["d", 1]]);
  expect(g.isolated).toBe(0);
  expect(buildLinkGraph([...notes, note("z", { title: "Lonely" })]).isolated).toBe(1);
});

test("layoutGraph is deterministic and keeps every node inside the box", () => {
  const first = layoutGraph(buildLinkGraph(notes));
  const second = layoutGraph(buildLinkGraph(notes));
  expect(first).toEqual(second);
  for (const n of first.nodes) {
    expect(n.x).toBeGreaterThanOrEqual(0);
    expect(n.x).toBeLessThanOrEqual(GRAPH_SIZE);
    expect(n.y).toBeGreaterThanOrEqual(0);
    expect(n.y).toBeLessThanOrEqual(GRAPH_SIZE);
  }
});

test("layoutGraph pulls linked notes closer than unlinked ones", () => {
  const { nodes } = layoutGraph(buildLinkGraph(notes));
  const at = (id: string) => nodes.find((n) => n.id === id)!;
  const dist = (p: string, q: string) => Math.hypot(at(p).x - at(q).x, at(p).y - at(q).y);
  expect(dist("a", "b")).toBeLessThan(dist("a", "d"));
  expect(dist("d", "c")).toBeLessThan(dist("b", "d"));
});

test("layoutGraph copes with no nodes and a single link", () => {
  expect(layoutGraph(buildLinkGraph([])).nodes).toEqual([]);
  const two = layoutGraph(buildLinkGraph([note("a", { title: "A", content: "[[B]]" }), note("b", { title: "B" })]));
  expect(two.nodes).toHaveLength(2);
  expect(two.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
});
