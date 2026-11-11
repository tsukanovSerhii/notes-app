import { mergeData, type Mergeable } from "@/app/lib/notes/merge";
import type { SealedNote } from "@/app/lib/sync/wire";

/** The fields conflict detection reads; plain and sealed notes both have them. */
export interface ConflictFields {
  id: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  editedAt: number;
  editedBy: string | null;
  trashedAt: number | null;
}

/**
 * Versions of notes whose text a merge would lose, from either side.
 *
 * Sync is last-write-wins per note, so when two devices edit the same note
 * between syncs, one edit silently replaces the other. The server, which sees
 * both versions, calls this before merging a device's replica:
 *
 * - an incoming version whose text changed after `since` holds edits the
 *   server never saw;
 * - a stored version edited after `since` by another device holds edits the
 *   requesting device never saw.
 *
 * Either is "lost" when, after the merge, its text is gone: replaced by the
 * other version or removed by a deletion. `textOf` says what "the text" is;
 * the server only sees a keyed hash of it. `since` is when the device took
 * the last snapshot the server merged; null means it never synced, and then
 * a note counts as changed when it was edited after its creation.
 */
export function findLostEdits<N extends ConflictFields, F extends { id: string; updatedAt: number }>(
  incoming: Mergeable<N, F>,
  stored: Mergeable<N, F>,
  since: number | null,
  deviceId: string | null,
  textOf: (n: N) => string
): N[] {
  const merged = new Map(mergeData(stored, incoming).notes.map((n) => [n.id, n]));
  const changed = (n: N) => (since === null ? n.editedAt > n.createdAt : n.editedAt > since);
  const lost = (n: N) => {
    if (n.trashedAt !== null || !changed(n)) return false;
    const after = merged.get(n.id);
    return !after || textOf(after) !== textOf(n);
  };
  // Knowing who made each edit rules out two false alarms: another device's
  // text this device merely received and sent back, and this device's own
  // earlier text from a round whose reply it never got.
  const byDevice = (n: N) => deviceId === null || n.editedBy === deviceId;
  const fromDevice = incoming.notes.filter((n) => byDevice(n) && lost(n));
  const seen = new Set(fromDevice.map((n) => n.id));
  const fromOthers = stored.notes.filter(
    (n) => !seen.has(n.id) && (deviceId === null || n.editedBy !== deviceId) && lost(n)
  );
  return [...fromDevice, ...fromOthers];
}

/**
 * A new note that keeps text a merge would overwrite. The server cannot read
 * or rename it; `conflictOf` labels it as a copy on every device and names
 * the note its sealed blob is bound to. The text, and so its hash, stay as
 * they were, so a device sending the copy back is not seen as a conflict.
 * The id derives from the lost version, so a retried request yields the same
 * copy, not a second one.
 */
export function conflictCopy(note: SealedNote, now: number): SealedNote {
  return {
    ...note,
    id: `${note.id}~conflict-${note.editedAt}`,
    pinned: false,
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
    editedAt: now,
    // The id the sealed blob is bound to; see openNote.
    conflictOf: note.conflictOf ?? note.id,
  };
}
