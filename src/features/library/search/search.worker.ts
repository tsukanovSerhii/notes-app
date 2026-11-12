/// <reference lib="webworker" />
import { createSearchIndex, type SearchDoc } from "@/features/library/search/searchIndex";

/**
 * Messages the page sends. `seq` numbers searches, so a late answer to an
 * earlier query can be told apart from the current one.
 */
export type SearchRequest =
  | { type: "apply"; changed: SearchDoc[]; removed: string[] }
  | { type: "search"; query: string; seq: number };

export type SearchResponse = { type: "results"; query: string; seq: number; ids: string[] };

const index = createSearchIndex();

self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const msg = event.data;
  if (msg.type === "apply") {
    index.apply(msg.changed, msg.removed);
  } else if (msg.type === "search") {
    const response: SearchResponse = { type: "results", query: msg.query, seq: msg.seq, ids: index.search(msg.query) };
    self.postMessage(response);
  }
};
