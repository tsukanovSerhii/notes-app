import type { Folder, Note, NotesData, Tombstones } from "@/features/notes/model/types";

/** localStorage key used by earlier builds and by the localStorage fallback. */
export const STORAGE_KEY = "notevoid-notes";
export const SCHEMA_VERSION = 2;

export interface PersistedState {
  data: NotesData;
  activeId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 32;

/** Lower-cases, trims and strips a leading "#"; returns "" for unusable tags. */
export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH);
}

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out = new Set<string>();
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const clean = normalizeTag(tag);
    if (clean) out.add(clean);
    if (out.size >= MAX_TAGS) break;
  }
  return [...out];
}

/** Turns one untrusted stored value into a Note, or null if it is unusable. */
export function parseNote(value: unknown): Note | null {
  if (!isRecord(value)) return null;
  const {
    id,
    title,
    content,
    pinned,
    tags,
    folderId,
    createdAt,
    updatedAt,
    editedAt,
    editedBy,
    trashedAt,
    conflictOf,
  } = value;
  if (typeof id !== "string" || !id) return null;

  const created = typeof createdAt === "number" ? createdAt : Date.now();
  const updated = typeof updatedAt === "number" ? updatedAt : created;
  return {
    id,
    title: typeof title === "string" ? title : "Untitled",
    content: typeof content === "string" ? content : "",
    pinned: pinned === true,
    tags: normalizeTags(tags),
    folderId: typeof folderId === "string" && folderId ? folderId : null,
    createdAt: created,
    updatedAt: updated,
    // Notes from earlier builds have no editedAt; their last change is the best guess.
    editedAt: typeof editedAt === "number" ? editedAt : updated,
    editedBy: typeof editedBy === "string" && editedBy ? editedBy.slice(0, 64) : null,
    trashedAt: typeof trashedAt === "number" && Number.isFinite(trashedAt) ? trashedAt : null,
    conflictOf: typeof conflictOf === "string" && conflictOf ? conflictOf.slice(0, 200) : null,
  };
}

export function parseFolder(value: unknown): Folder | null {
  if (!isRecord(value)) return null;
  const { id, name, createdAt, updatedAt } = value;
  if (typeof id !== "string" || !id) return null;
  if (typeof name !== "string" || !name.trim()) return null;
  const created = typeof createdAt === "number" ? createdAt : Date.now();
  return {
    id,
    name: name.trim().slice(0, 60),
    createdAt: created,
    updatedAt: typeof updatedAt === "number" ? updatedAt : created,
  };
}

function parseList<T extends { id: string }>(
  list: unknown,
  parse: (v: unknown) => T | null
): T[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    const parsed = parse(item);
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id);
      out.push(parsed);
    }
  }
  return out;
}

export function parseTombstones(value: unknown): Tombstones {
  if (!isRecord(value)) return {};
  const out: Tombstones = {};
  for (const [id, at] of Object.entries(value)) {
    if (typeof at === "number" && Number.isFinite(at)) out[id] = at;
  }
  return out;
}

/**
 * Validates untrusted data (storage, backups). Folder ids that point at no
 * folder are kept: the folder may arrive in another replica, and readers
 * already show such notes as unfiled.
 */
export function parseData(value: unknown): NotesData {
  if (Array.isArray(value)) {
    return { notes: parseList(value, parseNote), folders: [], tombstones: {} };
  }
  if (!isRecord(value)) return { notes: [], folders: [], tombstones: {} };
  const folders = parseList(value.folders, parseFolder);
  const notes = parseList(value.notes, parseNote);
  return { notes, folders, tombstones: parseTombstones(value.tombstones) };
}

/**
 * Reads a localStorage payload. Returns null when nothing has been stored yet
 * (first visit), so callers can tell "new user" apart from "user who deleted
 * every note".
 *
 * Accepts the current payload, the v1 payload and the bare array that the
 * first builds wrote, so existing notes survive upgrades.
 */
export function deserialize(raw: string | null): PersistedState | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { data: { notes: [], folders: [], tombstones: {} }, activeId: null };
  }
  const activeId =
    isRecord(parsed) && typeof parsed.activeId === "string" ? parsed.activeId : null;
  return { data: parseData(parsed), activeId };
}

export function serialize({ data, activeId }: PersistedState): string {
  return JSON.stringify({ version: SCHEMA_VERSION, ...data, activeId });
}
