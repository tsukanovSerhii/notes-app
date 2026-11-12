"use client";

import { useEffect, useRef, useState } from "react";
import type { Note } from "@/features/notes/model/types";
import { createSearchIndex, type SearchDoc, type SearchIndex } from "@/features/library/search/searchIndex";
import type { SearchRequest, SearchResponse } from "@/features/library/search/search.worker";

const toDoc = (n: Note): SearchDoc => ({ id: n.id, title: n.title, content: n.content, tags: n.tags, version: n.updatedAt });

/** The index lives off the main thread; if workers are unavailable it runs inline. */
type Backend = {
  apply(changed: SearchDoc[], removed: string[]): void;
  search(query: string, seq: number): void;
  onResults(cb: (r: SearchResponse) => void): void;
  stop(): void;
};

function createBackend(): Backend {
  let listener: (r: SearchResponse) => void = () => {};
  if (typeof Worker !== "undefined") {
    try {
      const worker = new Worker(new URL("./search.worker.ts", import.meta.url));
      worker.onmessage = (e: MessageEvent<SearchResponse>) => listener(e.data);
      const send = (m: SearchRequest) => worker.postMessage(m);
      return {
        apply: (changed, removed) => send({ type: "apply", changed, removed }),
        search: (query, seq) => send({ type: "search", query, seq }),
        onResults: (cb) => (listener = cb),
        stop: () => worker.terminate(),
      };
    } catch {
      // Fall through to the inline index (blocked workers, odd environments).
    }
  }
  const index: SearchIndex = createSearchIndex();
  return {
    apply: (changed, removed) => index.apply(changed, removed),
    search: (query, seq) => listener({ type: "results", query, seq, ids: index.search(query) }),
    onResults: (cb) => (listener = cb),
    stop: () => {},
  };
}

/**
 * Ranked full-text search over `notes`. Returns the matching ids best-first
 * for the current `query`, or null while there is no query or the first
 * answer is still on its way (callers fall back to a simple filter then).
 * The index is built lazily, on the first query, and then kept current by
 * sending only the notes that changed.
 */
export function useNoteSearch(notes: readonly Note[], query: string): string[] | null {
  const q = query.trim();
  const [answer, setAnswer] = useState<{ query: string; ids: string[] } | null>(null);
  const backend = useRef<Backend | null>(null);
  const sent = useRef(new Map<string, number>());
  const seq = useRef(0);
  const active = q !== "";

  useEffect(() => {
    if (!active) return;
    let current = backend.current;
    if (!current) {
      current = backend.current = createBackend();
      current.onResults((r) => {
        if (r.seq === seq.current) setAnswer({ query: r.query, ids: r.ids });
      });
    }
    // Send what changed since the last time: new and edited notes, and removals.
    const known = sent.current;
    const changed: SearchDoc[] = [];
    const present = new Set<string>();
    for (const n of notes) {
      present.add(n.id);
      if (known.get(n.id) !== n.updatedAt) {
        changed.push(toDoc(n));
        known.set(n.id, n.updatedAt);
      }
    }
    const removed = [...known.keys()].filter((id) => !present.has(id));
    for (const id of removed) known.delete(id);
    if (changed.length || removed.length) current.apply(changed, removed);
    current.search(q, ++seq.current);
  }, [notes, q, active]);

  useEffect(
    () => () => {
      backend.current?.stop();
      backend.current = null;
      sent.current.clear();
    },
    []
  );

  return active && answer?.query === q ? answer.ids : null;
}
