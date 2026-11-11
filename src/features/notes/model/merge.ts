import type { Folder, Note, NotesData, Tombstones } from "@/features/notes/model/types";

interface Versioned {
  id: string;
  updatedAt: number;
}

export function mergeTombstones(a: Tombstones, b: Tombstones): Tombstones {
  const out: Tombstones = { ...a };
  for (const [id, at] of Object.entries(b)) {
    out[id] = Math.max(out[id] ?? 0, at);
  }
  return out;
}

/**
 * Whether `candidate` should replace `current`. Newer wins; on an exact tie
 * the larger serialization wins, an arbitrary but order-independent rule, so
 * merge(a, b) and merge(b, a) pick the same version.
 */
export function wins<T extends Versioned>(candidate: T, current: T): boolean {
  if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
  if (candidate === current) return false;
  return JSON.stringify(candidate) > JSON.stringify(current);
}

/**
 * Last-write-wins merge by `updatedAt`. An entity is dropped when it was
 * deleted at or after its last edit; an edit made after the deletion wins.
 */
export function mergeEntities<T extends Versioned>(
  a: readonly T[],
  b: readonly T[],
  tombstones: Tombstones
): T[] {
  const byId = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const current = byId.get(item.id);
    if (!current || wins(item, current)) byId.set(item.id, item);
  }
  return [...byId.values()].filter(
    (item) => (tombstones[item.id] ?? -Infinity) < item.updatedAt
  );
}

/** The shape mergeData works on: plain notes on devices, sealed ones on the server. */
export interface Mergeable<N extends Versioned & { folderId: string | null }, F extends Versioned> {
  notes: N[];
  folders: F[];
  tombstones: Tombstones;
}

/**
 * Merges two replicas of the data. Commutative and idempotent, so the server
 * and every client converge on the same result whatever order syncs arrive in.
 */
export function mergeData<
  N extends Versioned & { folderId: string | null } = Note,
  F extends Versioned = Folder,
>(a: Mergeable<N, F>, b: Mergeable<N, F>): Mergeable<N, F> {
  const tombstones = mergeTombstones(a.tombstones, b.tombstones);
  const folders = mergeEntities<F>(a.folders, b.folders, tombstones);
  const folderIds = new Set(folders.map((f) => f.id));
  const notes = mergeEntities<N>(a.notes, b.notes, tombstones).map((n) =>
    n.folderId && !folderIds.has(n.folderId) ? { ...n, folderId: null } : n
  );
  return { notes, folders, tombstones };
}

/**
 * Prepares imported data (e.g. a backup) so it is restored even where the
 * user deleted those notes locally, for good or into the trash: revived
 * entries get an `updatedAt` newer than both the local copy and `now`, and
 * their local tombstones are lifted.
 */
export function reviveImported(
  local: NotesData,
  incoming: NotesData,
  now: number
): NotesData {
  const tombstones = { ...local.tombstones };
  const trashed = new Map(
    local.notes.filter((n) => n.trashedAt !== null).map((n) => [n.id, n.updatedAt])
  );
  const revive = <T extends Versioned>(item: T): T => {
    const deleted = item.id in tombstones;
    if (!deleted && !trashed.has(item.id)) return item;
    const localVersion = deleted ? tombstones[item.id] : trashed.get(item.id)!;
    delete tombstones[item.id];
    return { ...item, updatedAt: Math.max(item.updatedAt, now, localVersion + 1) };
  };
  return mergeData(
    { ...local, tombstones },
    {
      notes: incoming.notes.map(revive),
      folders: incoming.folders.map(revive),
      tombstones: {},
    }
  );
}

export const emptyData = (): NotesData => ({
  notes: [],
  folders: [],
  tombstones: {},
});
