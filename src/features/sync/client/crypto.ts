import type { Folder, Note, NotesData } from "@/features/notes/model/types";
import { normalizeTags } from "@/features/notes/model/schema";
import type { SealedData, SealedFolder, SealedNote } from "@/features/sync/shared/wire";

/**
 * End-to-end encryption for sync.
 *
 * The sync key the user copies between devices never leaves the device.
 * HKDF-SHA256 derives three independent keys from it:
 *
 * - a space token, sent to the server in place of the key (the server files
 *   data under a hash of the token, as it did with the key);
 * - an AES-GCM-256 key that seals note text, tags and folder names;
 * - an HMAC-SHA256 key for `textHash`, which lets the server see whether two
 *   versions of a note have the same text without seeing the text.
 *
 * Each sealed blob is bound to its entity (AES-GCM additional data), so the
 * server cannot move one note's text onto another note.
 */

export interface SyncKeys {
  spaceToken: string;
  encrypt: CryptoKey;
  mac: CryptoKey;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const SALT = enc.encode("notevoid-sync-v2");

const toB64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export async function deriveSyncKeys(syncKey: string): Promise<SyncKeys> {
  const subtle = crypto.subtle;
  const ikm = await subtle.importKey("raw", enc.encode(syncKey), "HKDF", false, ["deriveBits", "deriveKey"]);
  const hkdf = (info: string) => ({ name: "HKDF", hash: "SHA-256", salt: SALT, info: enc.encode(info) });
  const [token, encrypt, mac] = await Promise.all([
    subtle.deriveBits(hkdf("space-token"), ikm, 256),
    subtle.deriveKey(hkdf("encrypt"), ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
    subtle.deriveKey(hkdf("text-hash"), ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
  ]);
  return { spaceToken: toB64url(new Uint8Array(token)), encrypt, mac };
}

async function seal(key: CryptoKey, value: unknown, bind: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(bind) },
    key,
    enc.encode(JSON.stringify(value))
  );
  const out = new Uint8Array(12 + cipher.byteLength);
  out.set(iv);
  out.set(new Uint8Array(cipher), 12);
  return toB64url(out);
}

/** Throws if the blob was not sealed with this key for this entity. */
async function open(key: CryptoKey, sealed: string, bind: string): Promise<unknown> {
  const bytes = fromB64url(sealed);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: enc.encode(bind) },
    key,
    bytes.slice(12)
  );
  return JSON.parse(dec.decode(plain));
}

export async function textHash(keys: SyncKeys, title: string, content: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", keys.mac, enc.encode(`${title}\u0000${content}`));
  return toB64url(new Uint8Array(sig).slice(0, 18));
}

export async function sealNote(keys: SyncKeys, n: Note): Promise<SealedNote> {
  return {
    id: n.id,
    pinned: n.pinned,
    folderId: n.folderId,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    editedAt: n.editedAt,
    editedBy: n.editedBy,
    trashedAt: n.trashedAt,
    textHash: await textHash(keys, n.title, n.content),
    sealed: await seal(
      keys.encrypt,
      { title: n.title, content: n.content, tags: n.tags },
      `note:${boundTo(n)}`
    ),
    conflictOf: n.conflictOf,
  };
}

/**
 * The id a note's blob is sealed for. A conflict copy starts with the blob of
 * the note it copies, so it stays bound to that note's id for good.
 */
const boundTo = (n: { id: string; conflictOf: string | null }) => n.conflictOf ?? n.id;

export async function openNote(keys: SyncKeys, s: SealedNote): Promise<Note> {
  const body = (await open(keys.encrypt, s.sealed, `note:${boundTo(s)}`)) as Record<string, unknown>;
  return {
    id: s.id,
    title: typeof body.title === "string" ? body.title : "Untitled",
    content: typeof body.content === "string" ? body.content : "",
    tags: normalizeTags(body.tags),
    pinned: s.pinned,
    folderId: s.folderId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    editedAt: s.editedAt,
    editedBy: s.editedBy,
    trashedAt: s.trashedAt,
    conflictOf: s.conflictOf,
  };
}

export async function sealFolder(keys: SyncKeys, f: Folder): Promise<SealedFolder> {
  return {
    id: f.id,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    sealed: await seal(keys.encrypt, { name: f.name, parentId: f.parentId }, `folder:${f.id}`),
  };
}

export async function openFolder(keys: SyncKeys, s: SealedFolder): Promise<Folder> {
  const body = (await open(keys.encrypt, s.sealed, `folder:${s.id}`)) as Record<string, unknown>;
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 60) : "Folder";
  const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
  return { id: s.id, name, parentId, createdAt: s.createdAt, updatedAt: s.updatedAt };
}

export async function sealData(keys: SyncKeys, data: NotesData): Promise<SealedData> {
  const [notes, folders] = await Promise.all([
    Promise.all(data.notes.map((n) => sealNote(keys, n))),
    Promise.all(data.folders.map((f) => sealFolder(keys, f))),
  ]);
  return { notes, folders, tombstones: data.tombstones };
}

/**
 * Opens what the server sent. Entities that fail to decrypt (sealed with
 * another key, or tampered with) are skipped and counted, never trusted.
 */
export async function openData(keys: SyncKeys, data: SealedData): Promise<{ data: NotesData; rejected: number }> {
  let rejected = 0;
  const attempt = async <T>(p: Promise<T>) => {
    try {
      return await p;
    } catch {
      rejected++;
      return null;
    }
  };
  const [notes, folders] = await Promise.all([
    Promise.all(data.notes.map((n) => attempt(openNote(keys, n)))),
    Promise.all(data.folders.map((f) => attempt(openFolder(keys, f)))),
  ]);
  return {
    data: {
      notes: notes.filter((n): n is Note => n !== null),
      folders: folders.filter((f): f is Folder => f !== null),
      tombstones: data.tombstones,
    },
    rejected,
  };
}
