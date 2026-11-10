import type { Folder, Note, NotesData, Tombstones } from "@/app/types/note";

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
    if (!current || item.updatedAt > current.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()].filter(
    (item) => (tombstones[item.id] ?? -Infinity) < item.updatedAt
  );
}

/**
 * Merges two replicas of the data. Commutative and idempotent, so the server
 * and every client converge on the same result whatever order syncs arrive in.
 */
export function mergeData(a: NotesData, b: NotesData): NotesData {
  const tombstones = mergeTombstones(a.tombstones, b.tombstones);
  const folders = mergeEntities<Folder>(a.folders, b.folders, tombstones);
  const folderIds = new Set(folders.map((f) => f.id));
  const notes = mergeEntities<Note>(a.notes, b.notes, tombstones).map((n) =>
    n.folderId && !folderIds.has(n.folderId) ? { ...n, folderId: null } : n
  );
  return { notes, folders, tombstones };
}

/**
 * Prepares imported data (e.g. a backup) so it is restored even where the
 * user deleted those notes locally: revived entries get a fresh `updatedAt`
 * and their local tombstones are lifted.
 */
export function reviveImported(
  local: NotesData,
  incoming: NotesData,
  now: number
): NotesData {
  const tombstones = { ...local.tombstones };
  const revive = <T extends Versioned>(item: T): T => {
    if (!(item.id in tombstones)) return item;
    delete tombstones[item.id];
    return { ...item, updatedAt: Math.max(item.updatedAt, now) };
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
