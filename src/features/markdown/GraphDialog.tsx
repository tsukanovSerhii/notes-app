"use client";

import { useMemo, useState } from "react";
import type { Note } from "@/features/notes/model/types";
import { buildLinkGraph, GRAPH_SIZE, layoutGraph } from "@/features/markdown/lib/graph";
import Modal from "@/shared/ui/Modal";
import { useI18n } from "@/shared/i18n";

/** The notes and the [[links]] between them, as a picture you can click through. */
export default function GraphDialog({
  open,
  notes,
  activeId,
  onClose,
  onOpenNote,
}: {
  open: boolean;
  notes: Note[];
  activeId: string | null;
  onClose: () => void;
  onOpenNote: (id: string) => void;
}) {
  const { t, count } = useI18n();
  const [hovered, setHovered] = useState<string | null>(null);
  // Laid out only while the dialog is open: it is the costly part.
  const graph = useMemo(() => (open ? layoutGraph(buildLinkGraph(notes)) : null), [open, notes]);

  const neighbours = useMemo(() => {
    const set = new Set<string>();
    if (hovered && graph) {
      set.add(hovered);
      for (const e of graph.edges) {
        if (e.from === hovered) set.add(e.to);
        if (e.to === hovered) set.add(e.from);
      }
    }
    return set;
  }, [hovered, graph]);

  const byId = useMemo(() => new Map(graph?.nodes.map((n) => [n.id, n]) ?? []), [graph]);

  return (
    <Modal open={open} onClose={onClose} title={t.graph.title} wide>
      {graph && graph.nodes.length === 0 && <p className="text-sm text-text-muted">{t.graph.empty}</p>}
      {graph && graph.nodes.length > 0 && (
        <div className="space-y-2">
          <svg
            viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`}
            role="group"
            aria-label={t.graph.title}
            className="h-[min(60vh,32rem)] w-full rounded-md border border-border bg-bg-base/60"
          >
            {graph.edges.map((e) => {
              const a = byId.get(e.from)!;
              const b = byId.get(e.to)!;
              const dim = hovered !== null && !(neighbours.has(e.from) && neighbours.has(e.to));
              return (
                <line
                  key={`${e.from}>${e.to}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="var(--text-muted)"
                  strokeWidth={dim ? 1 : 2}
                  opacity={dim ? 0.15 : 0.55}
                />
              );
            })}
            {graph.nodes.map((n) => {
              const dim = hovered !== null && !neighbours.has(n.id);
              const radius = 10 + Math.min(n.degree, 8) * 2.5;
              return (
                <g
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.title || t.common.untitled} (${count(n.degree, t.plural.links)})`}
                  data-graph-node={n.id}
                  opacity={dim ? 0.25 : 1}
                  className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-[var(--text-primary)]"
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(n.id)}
                  onBlur={() => setHovered(null)}
                  onClick={() => {
                    onClose();
                    onOpenNote(n.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onClose();
                      onOpenNote(n.id);
                    }
                  }}
                >
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={radius}
                    fill="var(--accent)"
                    fillOpacity={n.id === activeId ? 1 : 0.55}
                    stroke="var(--accent)"
                    strokeWidth={n.id === activeId ? 4 : 2}
                  />
                  <text
                    x={n.x}
                    y={n.y + radius + 26}
                    textAnchor="middle"
                    fontSize={26}
                    fill="var(--text-primary)"
                    stroke="var(--bg-base)"
                    strokeWidth={6}
                    paintOrder="stroke"
                  >
                    {n.title.length > 24 ? `${n.title.slice(0, 23)}…` : n.title || t.common.untitled}
                  </text>
                </g>
              );
            })}
          </svg>
          {graph.isolated > 0 && (
            <p className="text-xs text-text-muted">{t.graph.isolated(count(graph.isolated, t.plural.notes))}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
