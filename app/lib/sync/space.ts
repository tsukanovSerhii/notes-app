import type { NotesData, Tombstones } from "@/app/types/note";
import { emptyData } from "@/app/lib/notes/merge";
import { parseData } from "@/app/lib/notes/storage";
import { TOMBSTONE_TTL_MS } from "@/app/lib/notes/reducer";

/**
 * Everything the server keeps for one sync space.
 *
 * - `version` goes up by one on every write. Clients keep the version they
 *   last saw as a cursor and only receive entities changed after it.
 * - `changes` records the version at which each entity last changed, keyed
 *   `n:<id>` (note), `f:<id>` (folder) or `t:<id>` (tombstone).
 * - `horizon` is the deletion time before which tombstones were pruned.
 */
export interface StoredSpace {
  version: number;
  data: NotesData;
  changes: Record<string, number>;
  horizon: number;
}

export const emptySpace = (): StoredSpace => ({
  version: 0,
  data: emptyData(),
  changes: {},
  horizon: 0,
});

export { TOMBSTONE_TTL_MS };

/** Validates a stored space, accepting the bare NotesData of earlier builds. */
export function parseSpace(value: unknown): StoredSpace {
  if (typeof value !== "object" || value === null) return emptySpace();
  const v = value as Record<string, unknown>;
  if (!("data" in v)) {
    // Earlier builds stored the NotesData itself.
    return { ...emptySpace(), data: parseData(value) };
  }
  const changes: Record<string, number> = {};
  if (typeof v.changes === "object" && v.changes !== null) {
    for (const [k, n] of Object.entries(v.changes)) {
      if (typeof n === "number" && Number.isFinite(n)) changes[k] = n;
    }
  }
  return {
    version: typeof v.version === "number" && v.version >= 0 ? Math.floor(v.version) : 0,
    data: parseData(v.data),
    changes,
    horizon: typeof v.horizon === "number" && Number.isFinite(v.horizon) ? v.horizon : 0,
  };
}

/** Keys of every entity that differs between two versions of the data. */
export function changedKeys(before: NotesData, after: NotesData): string[] {
  const keys: string[] = [];
  const diff = <T extends { id: string }>(prefix: string, a: readonly T[], b: readonly T[]) => {
    const old = new Map(a.map((x) => [x.id, x]));
    for (const item of b) {
      const prev = old.get(item.id);
      if (prev !== item && JSON.stringify(prev) !== JSON.stringify(item)) keys.push(prefix + item.id);
    }
  };
  diff("n:", before.notes, after.notes);
  diff("f:", before.folders, after.folders);
  for (const [id, at] of Object.entries(after.tombstones)) {
    if (before.tombstones[id] !== at) keys.push("t:" + id);
  }
  return keys;
}

/** The entities that changed after `cursor`. */
export function deltaSince(space: StoredSpace, cursor: number): NotesData {
  const after = (key: string) => (space.changes[key] ?? 0) > cursor;
  const tombstones: Tombstones = {};
  for (const [id, at] of Object.entries(space.data.tombstones)) {
    if (after("t:" + id)) tombstones[id] = at;
  }
  return {
    notes: space.data.notes.filter((n) => after("n:" + n.id)),
    folders: space.data.folders.filter((f) => after("f:" + f.id)),
    tombstones,
  };
}

/**
 * Drops tombstones older than the TTL so a space does not grow forever, and
 * moves the horizon up to the newest one dropped. A device that has not
 * synced since before the horizon may still hold a note deleted back then;
 * `guardAgainstPruned` stops it from bringing that note back.
 */
export function pruneTombstones(space: StoredSpace, now: number, ttlMs = TOMBSTONE_TTL_MS): StoredSpace {
  const cutoff = now - ttlMs;
  let horizon = space.horizon;
  let pruned = false;
  const tombstones: Tombstones = {};
  const changes = { ...space.changes };
  for (const [id, at] of Object.entries(space.data.tombstones)) {
    if (at < cutoff) {
      pruned = true;
      horizon = Math.max(horizon, at);
      delete changes["t:" + id];
    } else {
      tombstones[id] = at;
    }
  }
  if (!pruned) return space;
  return { ...space, data: { ...space.data, tombstones }, changes, horizon };
}

/**
 * Filters an incoming replica from a device whose last sync predates the
 * pruning horizon: entities the server does not know and that were last
 * changed before the horizon may have been deleted (and their tombstones
 * pruned) since, so they are not accepted. A device that never synced
 * (`since` null) uploads everything.
 */
export function guardAgainstPruned(
  incoming: NotesData,
  stored: StoredSpace,
  since: number | null | undefined
): NotesData {
  if (typeof since !== "number" || since >= stored.horizon) return incoming;
  const notes = new Set(stored.data.notes.map((n) => n.id));
  const folders = new Set(stored.data.folders.map((f) => f.id));
  return {
    notes: incoming.notes.filter((n) => notes.has(n.id) || n.updatedAt > stored.horizon),
    folders: incoming.folders.filter((f) => folders.has(f.id) || f.updatedAt > stored.horizon),
    tombstones: incoming.tombstones,
  };
}
