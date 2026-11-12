import { SHARE_ID, SHARE_KEY, type SharedNote } from "@/features/sharing/shared/share";
import { fromB64url, randomB64url, toB64url } from "@/shared/lib/base64url";

const enc = new TextEncoder();
const dec = new TextDecoder();
const SALT = enc.encode("notevoid-share-v1");

async function deriveKey(shareKey: string): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey("raw", fromB64url(shareKey) as BufferSource, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: enc.encode("seal") },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface SealedShare {
  id: string;
  /** The key for the link; never sent to the server. */
  key: string;
  deleteToken: string;
  deleteHash: string;
  blob: string;
}

/**
 * Seals a snapshot with a fresh random key. The ciphertext is bound to the id
 * (AES-GCM additional data), so the server cannot serve one note under
 * another link.
 */
export async function sealShare(note: SharedNote): Promise<SealedShare> {
  const id = randomB64url(16);
  const key = randomB64url(32);
  const deleteToken = randomB64url(24);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(`share:${id}`) },
    await deriveKey(key),
    enc.encode(JSON.stringify(note))
  );
  const sealed = new Uint8Array(12 + cipher.byteLength);
  sealed.set(iv);
  sealed.set(new Uint8Array(cipher), 12);
  return { id, key, deleteToken, deleteHash: await sha256Hex(deleteToken), blob: toB64url(sealed) };
}

/** Throws if the key is wrong, the link was tampered with, or the content is not a shared note. */
export async function openShare(id: string, key: string, blob: string): Promise<SharedNote> {
  if (!SHARE_ID.test(id) || !SHARE_KEY.test(key)) throw new Error("Invalid link");
  const bytes = fromB64url(blob);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: enc.encode(`share:${id}`) },
    await deriveKey(key),
    bytes.slice(12)
  );
  const value = JSON.parse(dec.decode(plain)) as Partial<SharedNote>;
  if (value.v !== 1 || typeof value.title !== "string" || typeof value.content !== "string") {
    throw new Error("Unsupported share");
  }
  return {
    v: 1,
    title: value.title,
    content: value.content,
    tags: Array.isArray(value.tags) ? value.tags.filter((t): t is string => typeof t === "string") : [],
    sharedAt: typeof value.sharedAt === "number" ? value.sharedAt : 0,
    attachments: Array.isArray(value.attachments)
      ? value.attachments.filter(
          (a): a is SharedNote["attachments"][number] =>
            typeof a?.id === "string" &&
            typeof a.type === "string" &&
            typeof a.name === "string" &&
            typeof a.data === "string"
        )
      : [],
  };
}

/** The link to give out: id and key both after `#`, so neither reaches a server log. */
export const shareUrl = (origin: string, id: string, key: string) => `${origin}/share#${id}.${key}`;

/** The id and key in a share link's fragment, or null. */
export function parseShareHash(hash: string): { id: string; key: string } | null {
  const m = /^#?([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(hash);
  return m ? { id: m[1], key: m[2] } : null;
}
