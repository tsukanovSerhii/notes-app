import { ATTACHMENT_ID, attachmentRefs } from "@/features/attachments/attachments";
import type { AttachmentStore } from "@/features/attachments/attachmentStore";
import { readBytes } from "@/features/attachments/attachments";
import { sealShare, shareUrl } from "@/features/sharing/client/shareCrypto";
import { MAX_SHARE_BYTES, type ShareTtl, type SharedNote } from "@/features/sharing/shared/share";
import type { Note } from "@/features/notes/model/types";
import { toB64url } from "@/shared/lib/base64url";

/** A link this device created, kept so its owner can see and revoke it. */
export interface ShareRecord {
  id: string;
  /** Lets the owner revoke the link; stays on this device. */
  deleteToken: string;
  noteId: string;
  title: string;
  createdAt: number;
  expiresAt: number;
  /** The link itself, so it can be copied again. */
  url: string;
}

export type ShareErrorCode = "tooLarge" | "busy" | "disabled" | "failed";

export class ShareError extends Error {
  constructor(
    readonly code: ShareErrorCode,
    message: string
  ) {
    super(message);
  }
}

export const SHARES_STORAGE = "notevoid-shares";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/** The links created on this device, in a small localStorage list. */
export function createShareRecords(storage: Storage | null) {
  const read = (): ShareRecord[] => {
    try {
      const parsed: unknown = JSON.parse(storage?.getItem(SHARES_STORAGE) ?? "[]");
      return Array.isArray(parsed)
        ? parsed.filter(
            (r): r is ShareRecord =>
              typeof r?.id === "string" &&
              typeof r.deleteToken === "string" &&
              typeof r.noteId === "string" &&
              typeof r.url === "string" &&
              typeof r.expiresAt === "number"
          )
        : [];
    } catch {
      return [];
    }
  };
  const write = (records: ShareRecord[]) => {
    try {
      storage?.setItem(SHARES_STORAGE, JSON.stringify(records));
    } catch {
      // Without storage the link still works; it just cannot be listed here.
    }
  };
  return {
    /** Live links, newest first; expired ones are dropped. */
    list(now: number): ShareRecord[] {
      const all = read();
      const live = all.filter((r) => r.expiresAt > now);
      if (live.length !== all.length) write(live);
      return live.sort((a, b) => b.createdAt - a.createdAt);
    },
    add(record: ShareRecord) {
      write([...read().filter((r) => r.id !== record.id), record]);
    },
    remove(id: string) {
      write(read().filter((r) => r.id !== id));
    },
  };
}

/**
 * What goes into a link: the note and the pictures it shows, as long as the
 * sealed result fits. `omitted` counts files left out for space.
 */
export async function buildSnapshot(
  note: Pick<Note, "title" | "content" | "tags">,
  store: AttachmentStore,
  now: number
): Promise<{ snapshot: SharedNote; omitted: number }> {
  const snapshot: SharedNote = { v: 1, title: note.title, content: note.content, tags: note.tags, sharedAt: now, attachments: [] };
  // Base64 grows the data by a third, and sealing adds a little more.
  let budget = Math.floor((MAX_SHARE_BYTES * 3) / 4) - JSON.stringify(snapshot).length - 1024;
  let omitted = 0;
  for (const id of attachmentRefs(note.content)) {
    const file = ATTACHMENT_ID.test(id) ? await store.get(id) : null;
    if (!file) continue;
    const data = toB64url(new Uint8Array(await readBytes(file.blob)));
    const cost = data.length + file.name.length + file.type.length + 80;
    if (cost > budget) {
      omitted++;
      continue;
    }
    budget -= cost;
    snapshot.attachments.push({ id, type: file.type, name: file.name, data });
  }
  return { snapshot, omitted };
}

const failure = (status: number): ShareError =>
  status === 413
    ? new ShareError("tooLarge", "This note is too large to share.")
    : status === 429
      ? new ShareError("busy", "Too many links created. Try again shortly.")
      : status === 503
        ? new ShareError("disabled", "Sharing is turned off on this server.")
        : new ShareError("failed", `Could not create the link (${status}).`);

/** Seals a snapshot of the note, uploads it and returns the record for the new link. */
export async function createShareLink({
  note,
  store,
  ttlDays,
  origin,
  fetch: fetchFn,
  records,
  now = Date.now(),
}: {
  note: Pick<Note, "id" | "title" | "content" | "tags">;
  store: AttachmentStore;
  ttlDays: ShareTtl;
  origin: string;
  fetch: typeof fetch;
  records: ReturnType<typeof createShareRecords>;
  now?: number;
}): Promise<{ record: ShareRecord; omitted: number }> {
  const { snapshot, omitted } = await buildSnapshot(note, store, now);
  const sealed = await sealShare(snapshot);
  const res = await fetchFn("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: sealed.id, blob: sealed.blob, deleteHash: sealed.deleteHash, ttlDays }),
  });
  if (!res.ok) throw failure(res.status);
  const { expiresAt } = (await res.json()) as { expiresAt: number };
  const record: ShareRecord = {
    id: sealed.id,
    deleteToken: sealed.deleteToken,
    noteId: note.id,
    title: note.title,
    createdAt: now,
    expiresAt,
    url: shareUrl(origin, sealed.id, sealed.key),
  };
  records.add(record);
  return { record, omitted };
}

/** Asks the server to delete the link and forgets it here. A link that is already gone counts as revoked. */
export async function revokeShareLink(
  record: ShareRecord,
  fetchFn: typeof fetch,
  records: ReturnType<typeof createShareRecords>
): Promise<void> {
  const res = await fetchFn(`/api/share/${record.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${record.deleteToken}` },
  });
  if (!res.ok && res.status !== 404) throw new ShareError("failed", `Could not revoke the link (${res.status}).`);
  records.remove(record.id);
}
