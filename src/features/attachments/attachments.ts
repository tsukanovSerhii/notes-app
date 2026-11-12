/**
 * Attachments: files (mostly pictures) that notes point at with
 * `attachment:<id>` links. An id is the SHA-256 of the file's bytes, so the
 * same file added twice is stored once, and a device that receives a note can
 * check what it downloaded against the id in the text.
 */

export const ATTACHMENT_SCHEME = "attachment:";
export const ATTACHMENT_ID = /^[a-f0-9]{64}$/;
/** Larger files are refused instead of filling the browser's storage. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface Attachment {
  /** SHA-256 of `blob`, lowercase hex. */
  id: string;
  blob: Blob;
  /** MIME type; decides whether the file is drawn in the note or offered as a download. */
  type: string;
  name: string;
  size: number;
  createdAt: number;
}

export const attachmentUri = (id: string) => `${ATTACHMENT_SCHEME}${id}`;

/** The id in an `attachment:<id>` link, or null for any other URL. */
export function attachmentIdFromUrl(url: string | undefined | null): string | null {
  if (!url?.startsWith(ATTACHMENT_SCHEME)) return null;
  const id = url.slice(ATTACHMENT_SCHEME.length);
  return ATTACHMENT_ID.test(id) ? id : null;
}

/**
 * Every attachment a text refers to. Code spans are not skipped on purpose:
 * keeping a file that is only mentioned in code costs little, while dropping
 * one that is still shown would lose data.
 */
export function attachmentRefs(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/attachment:([a-f0-9]{64})(?![a-f0-9])/g)) found.add(m[1]);
  return [...found];
}

/** Types a browser draws safely in an <img> (an SVG there cannot run scripts). */
const INLINE_IMAGES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml"]);
export const isInlineImage = (type: string) => INLINE_IMAGES.has(type);

/** A file name that is safe inside Markdown link text. */
export function cleanName(name: string): string {
  return name
    .replace(/[[\]\\<>\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
}

/** The Markdown that shows (images) or links (other files) an attachment. */
export function markdownFor(a: Pick<Attachment, "id" | "name" | "type">): string {
  const label = cleanName(a.name);
  return isInlineImage(a.type) ? `![${label.replace(/\.[^.]+$/, "")}](${attachmentUri(a.id)})` : `[${label}](${attachmentUri(a.id)})`;
}

export async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reads a Blob as bytes; the same call works where `blob.arrayBuffer` is missing. */
export function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
