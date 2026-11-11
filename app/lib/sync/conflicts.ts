import type { Note, NotesData } from "@/app/types/note";
import { mergeData } from "@/app/lib/notes/merge";

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
 * other version or removed by a deletion. `since` is when the device took
 * the last snapshot the server merged; null means it never synced, and then
 * a note counts as changed when it was edited after its creation.
 */
export function findLostEdits(
  incoming: NotesData,
  stored: NotesData,
  since: number | null,
  deviceId: string | null
): Note[] {
  const merged = new Map(mergeData(stored, incoming).notes.map((n) => [n.id, n]));
  const changed = (n: Note) => (since === null ? n.editedAt > n.createdAt : n.editedAt > since);
  const lost = (n: Note) => {
    if (n.trashedAt !== null || !changed(n)) return false;
    const after = merged.get(n.id);
    return !after || after.title !== n.title || after.content !== n.content;
  };
  // Knowing who made each edit rules out two false alarms: another device's
  // text this device merely received and sent back, and this device's own
  // earlier text from a round whose reply it never got.
  const byDevice = (n: Note) => deviceId === null || n.editedBy === deviceId;
  const fromDevice = incoming.notes.filter((n) => byDevice(n) && lost(n));
  const seen = new Set(fromDevice.map((n) => n.id));
  const fromOthers = stored.notes.filter(
    (n) => !seen.has(n.id) && (deviceId === null || n.editedBy !== deviceId) && lost(n)
  );
  return [...fromDevice, ...fromOthers];
}

export const CONFLICT_SUFFIX = " (conflict copy)";

/**
 * A new note that keeps text a merge would overwrite. Its id derives from the
 * lost version, so a retried request yields the same copy, not a second one.
 */
export function conflictCopy(note: Note, now: number): Note {
  const title = note.title.endsWith(CONFLICT_SUFFIX) ? note.title : note.title + CONFLICT_SUFFIX;
  return {
    ...note,
    id: `${note.id}~conflict-${note.editedAt}`,
    title,
    pinned: false,
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
    editedAt: now,
  };
}
