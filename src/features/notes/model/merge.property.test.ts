import { expect, test } from "@playwright/test";
import fc from "fast-check";
import { emptyData, mergeData } from "@/features/notes/model/merge";
import type { Folder, Note, NotesData } from "@/features/notes/model/types";

/**
 * Sync is only correct if merging replicas converges whatever order they
 * arrive in. These properties check that on random data, not on examples.
 *
 * Ids, times and folders come from tiny pools so replicas collide often:
 * the same note edited on two devices, equal timestamps, deleted folders.
 */
const ids = ["a", "b", "c", "d"];
const folderIds = ["f1", "f2"];
const times = fc.integer({ min: 0, max: 6 });
const text = fc.constantFrom("", "x", "y", "z");

const folderArb: fc.Arbitrary<Folder> = fc.record({
  id: fc.constantFrom(...folderIds),
  name: text,
  parentId: fc.option(fc.constantFrom(...folderIds), { nil: null }),
  createdAt: times,
  updatedAt: times,
});

const noteArb: fc.Arbitrary<Note> = fc.record({
  id: fc.constantFrom(...ids),
  title: text,
  content: text,
  pinned: fc.boolean(),
  tags: fc.constantFrom([], ["t"]),
  folderId: fc.option(fc.constantFrom(...folderIds), { nil: null }),
  createdAt: times,
  updatedAt: times,
  editedAt: times,
  editedBy: fc.constantFrom(null, "d1", "d2"),
  conflictOf: fc.constantFrom(null, "a"),
  trashedAt: fc.option(times, { nil: null }),
});

const dataArb: fc.Arbitrary<NotesData> = fc.record({
  notes: fc.array(noteArb, { maxLength: 6 }).map(oneVersionPerId),
  folders: fc.array(folderArb, { maxLength: 4 }).map(oneVersionPerId),
  tombstones: fc.dictionary(fc.constantFrom(...ids, ...folderIds), times, { maxKeys: 4 }),
});

/** A real replica holds one version of each entity. */
function oneVersionPerId<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((i) => [i.id, i])).values()];
}

/** Order of the arrays is not meaningful; compare by id. */
function canonical(d: NotesData) {
  const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((p, q) => p.id.localeCompare(q.id));
  return { notes: byId(d.notes), folders: byId(d.folders), tombstones: d.tombstones };
}

const options = { numRuns: 400 };

test("merging is commutative: the order of two replicas does not matter", () => {
  fc.assert(
    fc.property(dataArb, dataArb, (a, b) => {
      expect(canonical(mergeData(a, b))).toEqual(canonical(mergeData(b, a)));
    }),
    options
  );
});

test("merging is idempotent: merging a replica in again changes nothing", () => {
  fc.assert(
    fc.property(dataArb, dataArb, (a, b) => {
      const once = mergeData(a, b);
      expect(canonical(mergeData(once, b))).toEqual(canonical(once));
      expect(canonical(mergeData(once, once))).toEqual(canonical(once));
    }),
    options
  );
});

test("merging is associative: the grouping of three replicas does not matter", () => {
  fc.assert(
    fc.property(dataArb, dataArb, dataArb, (a, b, c) => {
      expect(canonical(mergeData(mergeData(a, b), c))).toEqual(canonical(mergeData(a, mergeData(b, c))));
    }),
    options
  );
});

test("a deleted entity never comes back through a merge unless it was edited after", () => {
  fc.assert(
    fc.property(dataArb, dataArb, (a, b) => {
      const merged = mergeData(a, b);
      for (const [id, deletedAt] of Object.entries(merged.tombstones)) {
        for (const item of [...merged.notes, ...merged.folders]) {
          if (item.id === id) expect(item.updatedAt).toBeGreaterThan(deletedAt);
        }
      }
    }),
    options
  );
});

test("merging never rewrites an entity: each result is one of the inputs", () => {
  fc.assert(
    fc.property(dataArb, dataArb, (a, b) => {
      const merged = mergeData(a, b);
      const inputs = [...a.notes, ...b.notes];
      for (const n of merged.notes) expect(inputs).toContainEqual(n);
      const folders = [...a.folders, ...b.folders];
      for (const f of merged.folders) expect(folders).toContainEqual(f);
    }),
    options
  );
});

test("merging with an empty replica only drops what a deletion already removed", () => {
  fc.assert(
    fc.property(dataArb, (a) => {
      expect(canonical(mergeData(a, emptyData()))).toEqual(canonical(mergeData(a, a)));
    }),
    options
  );
});
