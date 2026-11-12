import {
  MAX_ATTACHMENT_BYTES,
  hashBytes,
  readBytes,
  type Attachment,
} from "@/features/attachments/attachments";
import type { AttachmentStore } from "@/features/attachments/attachmentStore";

/** Photos are shrunk to this many pixels on the long side. */
export const MAX_IMAGE_SIDE = 2560;
/** Below this a photo is kept as it is: shrinking would save little. */
const KEEP_BELOW_BYTES = 400 * 1024;
const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

export class AttachmentTooLarge extends Error {
  constructor(readonly fileName: string) {
    super(`${fileName} is larger than the limit.`);
  }
}

/**
 * Scales a large picture down. A phone photo is several megabytes; on a
 * screen it never needs more than this. GIFs and SVGs are left alone (a GIF
 * would lose its animation). Returns the original when anything goes wrong
 * or when the result would not be smaller.
 */
export async function shrinkImage(file: Blob, maxSide = MAX_IMAGE_SIDE): Promise<Blob> {
  if (!RESIZABLE.has(file.type) || file.size < KEEP_BELOW_BYTES) return file;
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) {
      bitmap.close();
      return file;
    }
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    const shrunk = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));
    return shrunk && shrunk.size < file.size ? shrunk : file;
  } catch {
    return file;
  }
}

/**
 * Stores a file chosen, pasted or dropped by the user and returns its record.
 * Throws AttachmentTooLarge when it is over the limit even after shrinking.
 */
export async function addAttachment(
  store: AttachmentStore,
  file: File,
  now: () => number = Date.now
): Promise<Attachment> {
  const blob = await shrinkImage(file);
  if (blob.size > MAX_ATTACHMENT_BYTES) throw new AttachmentTooLarge(file.name);
  const id = await hashBytes(await readBytes(blob));
  const attachment: Attachment = {
    id,
    blob,
    type: blob.type || file.type || "application/octet-stream",
    name: file.name || "file",
    size: blob.size,
    createdAt: now(),
  };
  await store.put(attachment);
  // Another tab or an earlier paste may have stored it first, under its own name.
  return (await store.get(id)) ?? attachment;
}

/** How long a file nothing refers to is kept, in case the text is still being written. */
export const UNUSED_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Deletes files no text refers to any more, once they are older than the
 * grace period. `referenced` must cover everything that can show a file:
 * live notes, the trash and saved versions.
 */
export async function collectUnused(
  store: AttachmentStore,
  referenced: ReadonlySet<string>,
  now: number,
  graceMs = UNUSED_GRACE_MS
): Promise<number> {
  let removed = 0;
  for (const file of await store.list()) {
    if (referenced.has(file.id) || now - file.createdAt < graceMs) continue;
    await store.delete(file.id);
    removed++;
  }
  return removed;
}
