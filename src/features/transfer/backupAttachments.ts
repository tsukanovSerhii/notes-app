import {
  ATTACHMENT_ID,
  MAX_ATTACHMENT_BYTES,
  hashBytes,
  readBytes,
  referencedIds,
} from "@/features/attachments/attachments";
import type { AttachmentStore } from "@/features/attachments/attachmentStore";
import type { Note } from "@/features/notes/model/types";

/** An attachment inside a backup file. */
export interface BackupAttachment {
  id: string;
  type: string;
  name: string;
  /** The file's bytes, base64. */
  data: string;
}

/** A backup with pictures is bigger than one with only text. */
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** The files that `notes` (live and trashed) refer to and this device has. */
export async function collectBackupAttachments(
  notes: readonly Pick<Note, "content">[],
  store: AttachmentStore
): Promise<BackupAttachment[]> {
  const out: BackupAttachment[] = [];
  for (const id of referencedIds(notes.map((n) => n.content))) {
    const file = await store.get(id);
    if (!file) continue;
    out.push({ id, type: file.type, name: file.name, data: toBase64(new Uint8Array(await readBytes(file.blob))) });
  }
  return out;
}

/** Reads the attachments of a backup file, skipping any that are malformed. */
export function parseBackupAttachments(text: string): BackupAttachment[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const list = (parsed as { attachments?: unknown } | null)?.attachments;
  if (!Array.isArray(list)) return [];
  const out: BackupAttachment[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const { id, type, name, data } = item as Record<string, unknown>;
    if (typeof id !== "string" || !ATTACHMENT_ID.test(id)) continue;
    if (typeof data !== "string" || data.length > (MAX_ATTACHMENT_BYTES * 4) / 3 + 8) continue;
    out.push({
      id,
      data,
      type: typeof type === "string" ? type : "application/octet-stream",
      name: typeof name === "string" && name ? name : "file",
    });
  }
  return out;
}

/** Stores the files of a backup. Returns how many were added; a file whose bytes do not match its id is skipped. */
export async function restoreBackupAttachments(
  files: readonly BackupAttachment[],
  store: AttachmentStore,
  now: number
): Promise<number> {
  let added = 0;
  for (const f of files) {
    try {
      const bytes = fromBase64(f.data);
      if ((await hashBytes(bytes.slice().buffer as ArrayBuffer)) !== f.id) continue;
      if ((await store.get(f.id)) === null) added++;
      await store.put({
        id: f.id,
        blob: new Blob([bytes as BlobPart], { type: f.type }),
        type: f.type,
        name: f.name,
        size: bytes.length,
        createdAt: now,
      });
    } catch {
      // A damaged entry must not stop the rest of the backup.
    }
  }
  return added;
}
