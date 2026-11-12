import { SYNC_KEY_PATTERN } from "@/features/sync/shared/protocol";
import { fromB64url, toB64url } from "@/shared/lib/base64url";

const enc = new TextEncoder();
const dec = new TextDecoder();
const SALT = enc.encode("notevoid-recovery-v1");

export interface Recovery {
  /** Where the sealed key is stored on the server: 32 bytes as hex. */
  lookupId: string;
  wrapKey: CryptoKey;
}

/**
 * Two independent values from one secret: HKDF with different `info` makes the
 * lookup id useless for guessing the wrapping key, so what the server sees
 * (the id) says nothing about what protects the blob.
 */
export async function deriveRecovery(secret: Uint8Array): Promise<Recovery> {
  const ikm = await crypto.subtle.importKey("raw", secret as BufferSource, "HKDF", false, ["deriveBits", "deriveKey"]);
  const hkdf = (info: string) => ({ name: "HKDF", hash: "SHA-256", salt: SALT, info: enc.encode(info) });
  const [id, wrapKey] = await Promise.all([
    crypto.subtle.deriveBits(hkdf("lookup-id"), ikm, 256),
    crypto.subtle.deriveKey(hkdf("wrap-key"), ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
  ]);
  const lookupId = [...new Uint8Array(id)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { lookupId, wrapKey };
}

/** The sync key, sealed so that only the secret's owner can open it. */
export async function sealSyncKey({ lookupId, wrapKey }: Recovery, syncKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(`recovery:${lookupId}`) },
    wrapKey,
    enc.encode(syncKey)
  );
  const out = new Uint8Array(12 + cipher.byteLength);
  out.set(iv);
  out.set(new Uint8Array(cipher), 12);
  return toB64url(out);
}

/** Throws if the blob was not sealed with this secret, or does not hold a sync key. */
export async function openSyncKey({ lookupId, wrapKey }: Recovery, blob: string): Promise<string> {
  const bytes = fromB64url(blob);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12), additionalData: enc.encode(`recovery:${lookupId}`) },
    wrapKey,
    bytes.slice(12)
  );
  const key = dec.decode(plain);
  if (!SYNC_KEY_PATTERN.test(key)) throw new Error("Not a sync key");
  return key;
}
