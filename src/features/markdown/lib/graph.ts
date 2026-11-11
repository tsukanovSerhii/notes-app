import type { Note } from "@/features/notes/model/types";
import { findNoteByTitle, wikiTargets } from "@/features/markdown/lib/wikiLinks";

export interface GraphNode {
  id: string;
  title: string;
  /** Links in plus links out; drives the node's size. */
  degree: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface NoteGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Live notes with no links at all, left out of the picture. */
  isolated: number;
}

/** Notes linked by [[wiki links]]: only notes that link or are linked appear. */
export function buildLinkGraph(notes: readonly Note[]): Omit<NoteGraph, "nodes"> & {
  nodes: Omit<GraphNode, "x" | "y">[];
} {
  const live = notes.filter((n) => n.trashedAt === null);
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const note of live) {
    for (const title of wikiTargets(note.content)) {
      const target = findNoteByTitle(live, title);
      if (!target || target.id === note.id) continue;
      const key = `${note.id}>${target.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from: note.id, to: target.id });
      }
    }
  }
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const nodes = live
    .filter((n) => degree.has(n.id))
    .map((n) => ({ id: n.id, title: n.title.trim(), degree: degree.get(n.id)! }));
  return { nodes, edges, isolated: live.length - nodes.length };
}

export const GRAPH_SIZE = 1000;

/**
 * A force-directed layout: nodes repel, linked nodes pull together, and a
 * weak pull to the centre keeps separate clusters on screen. It starts from a
 * circle and runs a fixed number of steps, so the same graph always lays out
 * the same way (no random start). Positions fit inside [0, GRAPH_SIZE].
 */
export function layoutGraph(
  graph: ReturnType<typeof buildLinkGraph>,
  { iterations = 300, size = GRAPH_SIZE }: { iterations?: number; size?: number } = {}
): NoteGraph {
  const n = graph.nodes.length;
  const pos = graph.nodes.map((_, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, n);
    const r = size * 0.3;
    return { x: size / 2 + r * Math.cos(angle), y: size / 2 + r * Math.sin(angle) };
  });
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const links = graph.edges
    .map((e) => [index.get(e.from)!, index.get(e.to)!] as const)
    .filter(([a, b]) => a !== undefined && b !== undefined);

  const ideal = Math.sqrt((size * size) / Math.max(1, n)) * 0.55;
  for (let step = 0; step < iterations; step++) {
    const cooling = 1 - step / iterations;
    const move = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        const dist2 = dx * dx + dy * dy || 0.01;
        const dist = Math.sqrt(dist2);
        const push = (ideal * ideal) / dist;
        dx /= dist;
        dy /= dist;
        move[i].x += dx * push;
        move[i].y += dy * push;
        move[j].x -= dx * push;
        move[j].y -= dy * push;
      }
    }
    for (const [a, b] of links) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const pull = (dist * dist) / ideal;
      move[a].x -= (dx / dist) * pull;
      move[a].y -= (dy / dist) * pull;
      move[b].x += (dx / dist) * pull;
      move[b].y += (dy / dist) * pull;
    }
    const limit = size * 0.05 * cooling + 0.5;
    for (let i = 0; i < n; i++) {
      move[i].x += (size / 2 - pos[i].x) * 0.05;
      move[i].y += (size / 2 - pos[i].y) * 0.05;
      const len = Math.hypot(move[i].x, move[i].y) || 1;
      const step = Math.min(len, limit);
      pos[i].x += (move[i].x / len) * step;
      pos[i].y += (move[i].y / len) * step;
    }
  }

  // Scale into the box with a margin for labels.
  const margin = size * 0.08;
  const xs = pos.map((p) => p.x);
  const ys = pos.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((size - 2 * margin) / (maxX - minX || 1), (size - 2 * margin) / (maxY - minY || 1));
  const nodes: GraphNode[] = graph.nodes.map((node, i) => ({
    ...node,
    x: n === 1 ? size / 2 : margin + (pos[i].x - minX) * scale + (size - 2 * margin - (maxX - minX) * scale) / 2,
    y: n === 1 ? size / 2 : margin + (pos[i].y - minY) * scale + (size - 2 * margin - (maxY - minY) * scale) / 2,
  }));
  return { nodes, edges: graph.edges, isolated: graph.isolated };
}
