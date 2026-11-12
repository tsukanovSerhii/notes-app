import MiniSearch from "minisearch";

/** What the index needs of a note; `version` changes whenever the text does. */
export interface SearchDoc {
  id: string;
  title: string;
  content: string;
  tags: string[];
  version: number;
}

export interface SearchIndex {
  /** Brings the index in line with `docs`: adds new ones, replaces changed ones, drops the rest. */
  sync(docs: readonly SearchDoc[]): void;
  /** Applies only what changed (used by the worker, which receives deltas). */
  apply(changed: readonly SearchDoc[], removedIds: readonly string[]): void;
  /** Ids of matching notes, best match first. */
  search(query: string): string[];
  readonly size: number;
}

const FIELDS = ["title", "content", "tags"] as const;

/** Tags are searched with and without their "#". */
const prepare = (doc: SearchDoc) => ({ id: doc.id, title: doc.title, content: doc.content, tags: doc.tags.join(" ") });

/**
 * A full-text index over notes: every word must match (a prefix is enough,
 * and a typo or two is forgiven for longer words), titles weigh most, then
 * tags, then text. Independent of the DOM so it runs in a worker and in tests.
 */
export function createSearchIndex(): SearchIndex {
  const mini = new MiniSearch({
    fields: [...FIELDS],
    storeFields: [],
    idField: "id",
    searchOptions: {
      boost: { title: 4, tags: 2 },
      prefix: true,
      fuzzy: (term) => (term.length > 4 ? 0.2 : false),
      combineWith: "AND",
    },
    // Unicode letters and digits, so Ukrainian and other scripts tokenize.
    tokenize: (text) => text.split(/[^\p{L}\p{N}_]+/u).filter(Boolean),
    processTerm: (term) => term.toLowerCase(),
  });
  const versions = new Map<string, number>();

  const upsert = (doc: SearchDoc) => {
    if (versions.get(doc.id) === doc.version) return;
    if (versions.has(doc.id)) mini.replace(prepare(doc));
    else mini.add(prepare(doc));
    versions.set(doc.id, doc.version);
  };
  const remove = (id: string) => {
    if (!versions.delete(id)) return;
    mini.discard(id);
  };

  return {
    sync(docs) {
      const keep = new Set(docs.map((d) => d.id));
      for (const id of [...versions.keys()]) if (!keep.has(id)) remove(id);
      for (const doc of docs) upsert(doc);
    },
    apply(changed, removedIds) {
      for (const id of removedIds) remove(id);
      for (const doc of changed) upsert(doc);
    },
    search(query) {
      const q = query.trim().replace(/^#/, "");
      if (!q) return [];
      return mini.search(q).map((r) => String(r.id));
    },
    get size() {
      return versions.size;
    },
  };
}
