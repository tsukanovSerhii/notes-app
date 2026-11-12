import type { AttachmentStore } from "@/features/attachments/attachmentStore";
import { openAttachment, remoteId, sealAttachment } from "@/features/sync/client/attachmentCrypto";
import type { SyncKeys } from "@/features/sync/client/crypto";

export const ATTACHMENT_PRUNE_STORAGE = "notevoid-attachment-prune";
const PRUNE_EVERY_MS = 24 * 60 * 60 * 1000;
/** A file the server did not have is asked for again after this long. */
const RETRY_MISSING_MS = 60_000;
const BATCH = 100;
const PARALLEL_DOWNLOADS = 3;

export interface AttachmentSyncResult {
  /** Files still to upload or download after this pass. */
  pending: number;
  error: string | null;
}

export interface AttachmentSyncOptions {
  store: AttachmentStore;
  /** Ids that live and trashed notes refer to: these are kept in step with the server. */
  referenced: () => ReadonlySet<string>;
  /** Everything worth keeping on the server, including saved versions, for pruning. */
  keepOnServer?: () => Promise<ReadonlySet<string>>;
  fetch: typeof fetch;
  endpoint?: string;
  now?: () => number;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
}

export interface AttachmentSync {
  /** Uploads what the server lacks and downloads what notes need. Never throws. */
  run(keys: SyncKeys): Promise<AttachmentSyncResult>;
  /** Forgets what is known about the server, e.g. after switching spaces. */
  reset(): void;
}

class ServerError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function createAttachmentSync({
  store,
  referenced,
  keepOnServer,
  fetch: fetchFn,
  endpoint = "/api/sync/attachments",
  now = Date.now,
  storage = null,
}: AttachmentSyncOptions): AttachmentSync {
  /** Files known to be on the server. */
  const confirmed = new Set<string>();
  const retryAt = new Map<string, number>();

  const call = async (keys: SyncKeys, url: string, init: RequestInit = {}) => {
    const res = await fetchFn(url, {
      ...init,
      headers: { Authorization: `Bearer ${keys.spaceToken}`, ...init.headers },
    });
    if (res.status === 429) throw new ServerError(429, "The server is busy; attachments will retry shortly.");
    return res;
  };

  const manage = async (keys: SyncKeys, body: Record<string, unknown>) => {
    const res = await call(keys, endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: keys.spaceToken, ...body }),
    });
    if (!res.ok) throw new ServerError(res.status, `Attachment request failed (${res.status})`);
    return (await res.json()) as Record<string, unknown>;
  };

  async function upload(keys: SyncKeys, ids: string[], local: ReadonlySet<string>) {
    let error: string | null = null;
    for (let from = 0; from < ids.length && !error; from += BATCH) {
      const batch = ids.slice(from, from + BATCH);
      const rids = await Promise.all(batch.map((id) => remoteId(keys, id)));
      const have = new Set((await manage(keys, { op: "have", ids: rids })).have as string[]);
      for (let i = 0; i < batch.length && !error; i++) {
        const id = batch[i];
        if (have.has(rids[i])) {
          confirmed.add(id);
          continue;
        }
        const file = local.has(id) ? await store.get(id) : null;
        if (!file) continue;
        const chunks = await sealAttachment(keys, file);
        for (let index = 0; index < chunks.length; index++) {
          const res = await call(keys, `${endpoint}/${rids[i]}/${index}?parts=${chunks.length}`, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: chunks[index] as BodyInit,
          });
          if (res.status === 413) {
            error = "The attachment storage of this sync space is full.";
            break;
          }
          if (!res.ok) throw new ServerError(res.status, `Attachment upload failed (${res.status})`);
        }
        if (!error) confirmed.add(id);
      }
    }
    return error;
  }

  async function download(keys: SyncKeys, id: string): Promise<boolean> {
    const rid = await remoteId(keys, id);
    const first = await call(keys, `${endpoint}/${rid}/0`);
    if (first.status === 404) {
      retryAt.set(id, now() + RETRY_MISSING_MS);
      return false;
    }
    if (!first.ok) throw new ServerError(first.status, `Attachment download failed (${first.status})`);
    const parts = Number(first.headers.get("X-Parts"));
    if (!Number.isInteger(parts) || parts < 1 || parts > 16) throw new Error("Attachment has an invalid size");
    const chunks = [new Uint8Array(await first.arrayBuffer())];
    for (let index = 1; index < parts; index++) {
      const res = await call(keys, `${endpoint}/${rid}/${index}`);
      if (res.status === 404) {
        retryAt.set(id, now() + RETRY_MISSING_MS);
        return false;
      }
      if (!res.ok) throw new ServerError(res.status, `Attachment download failed (${res.status})`);
      chunks.push(new Uint8Array(await res.arrayBuffer()));
    }
    await store.put(await openAttachment(keys, id, chunks, now()));
    confirmed.add(id);
    return true;
  }

  async function prune(keys: SyncKeys) {
    if (!keepOnServer) return;
    const stored = storage?.getItem(ATTACHMENT_PRUNE_STORAGE);
    const last = stored ? Number(stored) : NaN;
    if (Number.isFinite(last) && now() - last < PRUNE_EVERY_MS) return;
    const keep = await Promise.all([...(await keepOnServer())].map((id) => remoteId(keys, id)));
    await manage(keys, { op: "prune", keep });
    storage?.setItem(ATTACHMENT_PRUNE_STORAGE, String(now()));
    // Whatever was removed may have been something this device had confirmed.
    confirmed.clear();
  }

  return {
    reset() {
      confirmed.clear();
      retryAt.clear();
    },

    async run(keys) {
      const refs = referenced();
      let error: string | null = null;
      try {
        const local = new Set((await store.list()).map((f) => f.id));
        const toUpload = [...refs].filter((id) => local.has(id) && !confirmed.has(id));
        error = await upload(keys, toUpload, local);

        const wanted = [...refs].filter((id) => !local.has(id) && (retryAt.get(id) ?? 0) <= now());
        let next = 0;
        const worker = async () => {
          while (next < wanted.length) {
            const id = wanted[next++];
            try {
              await download(keys, id);
            } catch (e) {
              // A file that will not open (wrong key, damaged) is left alone for a while.
              if (e instanceof ServerError) throw e;
              retryAt.set(id, now() + RETRY_MISSING_MS);
              error ??= "Some attachments could not be opened.";
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(PARALLEL_DOWNLOADS, wanted.length) }, worker));
        if (!error) await prune(keys);
      } catch (e) {
        error = e instanceof Error ? e.message : "Attachment sync failed.";
      }

      const after = new Set((await store.list().catch(() => [])).map((f) => f.id));
      const pending = [...refs].filter((id) => !after.has(id) || !confirmed.has(id)).length;
      return { pending, error };
    },
  };
}
