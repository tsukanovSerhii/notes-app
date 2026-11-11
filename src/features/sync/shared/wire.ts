import type { Tombstones } from "@/features/notes/model/types";
import { parseTombstones } from "@/features/notes/model/schema";

/**
 * What a note looks like on the wire and on the server: everything the
 * server needs to merge and detect conflicts stays readable, the text is
 * sealed. `textHash` is a keyed hash of title and text, so the server can
 * tell whether two versions differ without reading either.
 */
export interface SealedNote {
  id: string;
  pinned: boolean;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  editedAt: number;
  editedBy: string | null;
  trashedAt: number | null;
  textHash: string;
  /** base64url(iv || AES-GCM ciphertext of { title, content, tags }). */
  sealed: string;
  /** Set by the server on a conflict copy: the id of the note it came from. */
  conflictOf: string | null;
}

export interface SealedFolder {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** base64url(iv || AES-GCM ciphertext of { name }). */
  sealed: string;
}

export interface SealedData {
  notes: SealedNote[];
  folders: SealedFolder[];
  tombstones: Tombstones;
}

export const emptySealedData = (): SealedData => ({ notes: [], folders: [], tombstones: {} });

const ID = /^[A-Za-z0-9_~:.-]{1,128}$/;
const B64URL = /^[A-Za-z0-9_-]*$/;
/** A single sealed note can be large, but not larger than a request. */
const MAX_SEALED = 2 * 1024 * 1024;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const sealedString = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= MAX_SEALED && B64URL.test(v);

function parseSealedNote(v: unknown): SealedNote | null {
  if (!isRecord(v) || typeof v.id !== "string" || !ID.test(v.id)) return null;
  if (!sealedString(v.sealed) || typeof v.textHash !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(v.textHash)) {
    return null;
  }
  if (!num(v.createdAt) || !num(v.updatedAt)) return null;
  return {
    id: v.id,
    pinned: v.pinned === true,
    folderId: typeof v.folderId === "string" && ID.test(v.folderId) ? v.folderId : null,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    editedAt: num(v.editedAt) ? v.editedAt : v.updatedAt,
    editedBy: typeof v.editedBy === "string" && v.editedBy ? v.editedBy.slice(0, 64) : null,
    trashedAt: num(v.trashedAt) ? v.trashedAt : null,
    textHash: v.textHash,
    sealed: v.sealed,
    conflictOf: typeof v.conflictOf === "string" && ID.test(v.conflictOf) ? v.conflictOf : null,
  };
}

function parseSealedFolder(v: unknown): SealedFolder | null {
  if (!isRecord(v) || typeof v.id !== "string" || !ID.test(v.id)) return null;
  if (!sealedString(v.sealed) || !num(v.createdAt) || !num(v.updatedAt)) return null;
  return { id: v.id, createdAt: v.createdAt, updatedAt: v.updatedAt, sealed: v.sealed };
}

function parseList<T extends { id: string }>(list: unknown, parse: (v: unknown) => T | null): T[] {
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

/**
 * Validates untrusted sealed data (request bodies, stored spaces). Payloads
 * may be deltas, so folder ids are kept even when their folder is absent;
 * the merge moves notes out of folders that are really gone.
 */
export function parseSealedData(value: unknown): SealedData {
  if (!isRecord(value)) return emptySealedData();
  return {
    notes: parseList(value.notes, parseSealedNote),
    folders: parseList(value.folders, parseSealedFolder),
    tombstones: parseTombstones(value.tombstones),
  };
}
