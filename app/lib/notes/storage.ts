import type { Note } from "@/app/types/note";

export const STORAGE_KEY = "notevoid-notes";
const SCHEMA_VERSION = 1;

export interface PersistedNotes {
  notes: Note[];
  activeId: string | null;
}

interface PersistedPayloadV1 {
  version: typeof SCHEMA_VERSION;
  notes: unknown;
  activeId: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Turns one untrusted stored value into a Note, or null if it is unusable. */
export function parseNote(value: unknown): Note | null {
  if (!isRecord(value)) return null;
  const { id, title, content, pinned, createdAt, updatedAt } = value;
  if (typeof id !== "string" || !id) return null;

  const created = typeof createdAt === "number" ? createdAt : Date.now();
  return {
    id,
    title: typeof title === "string" ? title : "Untitled",
    content: typeof content === "string" ? content : "",
    pinned: pinned === true,
    createdAt: created,
    updatedAt: typeof updatedAt === "number" ? updatedAt : created,
  };
}

/**
 * Reads whatever is stored under STORAGE_KEY.
 * Returns null when nothing has been stored yet (first visit), so callers can
 * tell "new user" apart from "user who deleted every note".
 *
 * Accepts both the current versioned payload and the legacy bare array that
 * earlier builds wrote, so existing notes survive the upgrade.
 */
export function deserialize(raw: string | null): PersistedNotes | null {
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { notes: [], activeId: null };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.notes)
      ? parsed.notes
      : [];

  const seen = new Set<string>();
  const notes: Note[] = [];
  for (const item of list) {
    const note = parseNote(item);
    if (note && !seen.has(note.id)) {
      seen.add(note.id);
      notes.push(note);
    }
  }

  const activeId =
    isRecord(parsed) && typeof parsed.activeId === "string"
      ? parsed.activeId
      : null;

  return { notes, activeId };
}

export function serialize(data: PersistedNotes): string {
  const payload: PersistedPayloadV1 = {
    version: SCHEMA_VERSION,
    notes: data.notes,
    activeId: data.activeId,
  };
  return JSON.stringify(payload);
}
