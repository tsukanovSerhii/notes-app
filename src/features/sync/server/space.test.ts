import { expect, test } from "@playwright/test";
import {
  changedKeys,
  deltaSince,
  emptySpace,
  guardAgainstPruned,
  parseSpace,
  pruneTombstones,
  TOMBSTONE_TTL_MS,
  type StoredSpace,
} from "@/features/sync/server/space";
import { sealedNote as note } from "@/features/sync/testing";
import type { SealedData, SealedFolder } from "@/features/sync/shared/wire";

const folder = (id: string): SealedFolder => ({ id, createdAt: 0, updatedAt: 0, sealed: `sealed${id}` });

const data = (d: Partial<SealedData>): SealedData => ({ notes: [], folders: [], tombstones: {}, ...d });
const space = (d: Partial<StoredSpace>): StoredSpace => ({ ...emptySpace(), ...d });

test("parseSpace validates a stored space and ignores the plaintext format of earlier builds", () => {
  const legacy = { notes: [note("a")], folders: [], tombstones: { b: 1 } };
  expect(parseSpace(legacy)).toEqual(emptySpace());
  expect(parseSpace({ version: 3, data: legacy, changes: { "n:a": 2, bad: "x" }, horizon: 5 })).toEqual({
    version: 3,
    data: legacy,
    changes: { "n:a": 2 },
    horizon: 5,
  });
});

test("changedKeys lists new or different entities and raised tombstones", () => {
  const a = note("a");
  const before = data({ notes: [a, note("b")], folders: [folder("f")], tombstones: { x: 1 } });
  const after = data({
    notes: [a, note("b", { textHash: "hash-edited" }), note("c")],
    folders: [folder("f")],
    tombstones: { x: 1, y: 2 },
  });
  expect(changedKeys(before, after).sort()).toEqual(["n:b", "n:c", "t:y"]);
});

test("deltaSince returns only what changed after the cursor", () => {
  const s = space({
    version: 3,
    data: data({ notes: [note("a"), note("b")], folders: [folder("f")], tombstones: { x: 1, y: 2 } }),
    changes: { "n:a": 1, "n:b": 3, "f:f": 2, "t:x": 1, "t:y": 3 },
  });
  expect(deltaSince(s, 2)).toEqual(data({ notes: [note("b")], tombstones: { y: 2 } }));
  expect(deltaSince(s, 0).notes).toHaveLength(2);
});

test.describe("pruneTombstones", () => {
  const now = 200 * 24 * 60 * 60 * 1000;
  const old = now - TOMBSTONE_TTL_MS - 1;
  const recent = now - 1000;

  test("drops tombstones past the TTL and raises the horizon", () => {
    const s = space({ data: data({ tombstones: { old, recent } }), changes: { "t:old": 1, "t:recent": 2 } });
    const pruned = pruneTombstones(s, now);
    expect(pruned.data.tombstones).toEqual({ recent });
    expect(pruned.changes).toEqual({ "t:recent": 2 });
    expect(pruned.horizon).toBe(old);
  });

  test("returns the same space when nothing is old enough", () => {
    const s = space({ data: data({ tombstones: { recent } }) });
    expect(pruneTombstones(s, now)).toBe(s);
  });
});

test.describe("guardAgainstPruned", () => {
  const stored = space({ horizon: 100, data: data({ notes: [note("known")] }) });
  const incoming = data({
    notes: [
      note("known", { updatedAt: 50 }),
      note("stale", { updatedAt: 50 }), // maybe deleted before the horizon
      note("fresh", { updatedAt: 150 }),
    ],
  });
  const ids = (d: SealedData) => d.notes.map((n) => n.id);

  test("a device that last synced before the horizon cannot revive old unknown notes", () => {
    expect(ids(guardAgainstPruned(incoming, stored, 80))).toEqual(["known", "fresh"]);
  });

  test("devices that synced after the horizon, or never, are trusted", () => {
    expect(ids(guardAgainstPruned(incoming, stored, 120))).toEqual(["known", "stale", "fresh"]);
    expect(ids(guardAgainstPruned(incoming, stored, null))).toEqual(["known", "stale", "fresh"]);
  });
});
