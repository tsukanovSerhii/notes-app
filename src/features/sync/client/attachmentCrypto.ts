import { hashBytes, readBytes, type Attachment } from "@/features/attachments/attachments";
import type { SyncKeys } from "@/features/sync/client/crypto";
import { CHUNK_BYTES } from "@/features/sync/shared/attachments";

/**
 * Sealing attachments for the server.
 *
 * - The remote id is an HMAC of the content id, so the server cannot match
 *   what it stores against files it knows.
 * - The sealed stream is `[4 bytes: header length][header JSON: type, name]
 *   [file bytes]`, cut into CHUNK_BYTES pieces, each sealed with AES-GCM.
 *   A chunk is bound (AES-GCM additional data) to the file's id, its index
 *   and the part count, so the server cannot reorder, swap or cut chunks.
 * - A reader checks the SHA-256 of what it reassembled against the id in the
 *   note text, so a wrong or tampered file is never stored.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export async function remoteId(keys: SyncKeys, id: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", keys.mac, enc.encode(`attachment:${id}`));
  return toB64url(new Uint8Array(sig));
}

const bind = (id: string, index: number, parts: number) => enc.encode(`attachment:${id}:${index}:${parts}`);

export async function sealAttachment(keys: SyncKeys, a: Attachment): Promise<Uint8Array[]> {
  const header = enc.encode(JSON.stringify({ type: a.type, name: a.name }));
  const file = new Uint8Array(await readBytes(a.blob));
  const stream = new Uint8Array(4 + header.length + file.length);
  new DataView(stream.buffer).setUint32(0, header.length);
  stream.set(header, 4);
  stream.set(file, 4 + header.length);

  const parts = Math.max(1, Math.ceil(stream.length / CHUNK_BYTES));
  const sealed: Uint8Array[] = [];
  for (let i = 0; i < parts; i++) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: bind(a.id, i, parts) },
      keys.encrypt,
      stream.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES)
    );
    const out = new Uint8Array(12 + cipher.byteLength);
    out.set(iv);
    out.set(new Uint8Array(cipher), 12);
    sealed.push(out);
  }
  return sealed;
}

/** Throws if a chunk is missing or altered, or the file does not match `id`. */
export async function openAttachment(
  keys: SyncKeys,
  id: string,
  chunks: Uint8Array[],
  now: number
): Promise<Attachment> {
  const parts = chunks.length;
  const plain: Uint8Array[] = [];
  for (let i = 0; i < parts; i++) {
    const c = chunks[i];
    plain.push(
      new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: c.slice(0, 12), additionalData: bind(id, i, parts) },
          keys.encrypt,
          c.slice(12)
        )
      )
    );
  }
  const stream = new Uint8Array(plain.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of plain) {
    stream.set(p, at);
    at += p.length;
  }
  if (stream.length < 4) throw new Error("Attachment is truncated");
  const headerLength = new DataView(stream.buffer).getUint32(0);
  if (4 + headerLength > stream.length) throw new Error("Attachment header is damaged");
  const header = JSON.parse(dec.decode(stream.slice(4, 4 + headerLength))) as { type?: unknown; name?: unknown };
  const file = stream.slice(4 + headerLength);
  if ((await hashBytes(file.buffer as ArrayBuffer)) !== id) throw new Error("Attachment does not match its id");
  const type = typeof header.type === "string" ? header.type : "application/octet-stream";
  return {
    id,
    blob: new Blob([file], { type }),
    type,
    name: typeof header.name === "string" ? header.name : "file",
    size: file.length,
    createdAt: now,
  };
}
