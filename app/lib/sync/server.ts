import type { NotesData } from "@/app/types/note";
import { emptyData, mergeData } from "@/app/lib/notes/merge";
import { parseData } from "@/app/lib/notes/storage";
import { DEVICE_ID_PATTERN, SYNC_KEY_PATTERN, type SyncResponse } from "@/app/lib/sync/protocol";
import { conflictCopy, findLostEdits } from "@/app/lib/sync/conflicts";
import type { RateLimiter } from "@/app/lib/sync/rateLimit";

/**
 * Where synced data lives. The file repository is enough for a demo or a
 * single server; a Postgres implementation only needs these two methods.
 */
export interface SyncRepository {
  get(spaceId: string): Promise<NotesData | null>;
  put(spaceId: string, data: NotesData): Promise<void>;
}

export interface SyncResult {
  status: number;
  body: SyncResponse | { error: string };
  /** Set with status 429. */
  retryAfterSec?: number;
}

/** Serializes read-merge-write per space so concurrent devices don't lose writes. */
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  const tail = next.catch(() => {});
  locks.set(id, tail);
  void tail.then(() => {
    if (locks.get(id) === tail) locks.delete(id);
  });
  return next;
}

/**
 * Merges the client's replica into the stored one and returns the result.
 * The key is never stored: data is filed under a hash of it.
 */
export async function handleSyncRequest(
  repo: SyncRepository,
  body: unknown,
  hashKey: (key: string) => string,
  now: () => number = Date.now,
  /** Optional per-space limit, checked before any storage work. */
  limitSpace?: RateLimiter
): Promise<SyncResult> {
  if (typeof body !== "object" || body === null) {
    return { status: 400, body: { error: "Expected a JSON object." } };
  }
  const { key, data, since, deviceId } = body as {
    key?: unknown;
    data?: unknown;
    since?: unknown;
    deviceId?: unknown;
  };
  if (typeof key !== "string" || !SYNC_KEY_PATTERN.test(key)) {
    return { status: 400, body: { error: "Invalid sync key." } };
  }

  const spaceId = hashKey(key);
  const decision = limitSpace?.take(spaceId);
  if (decision && !decision.ok) {
    return {
      status: 429,
      body: { error: "Too many sync requests. Try again shortly." },
      retryAfterSec: decision.retryAfterSec,
    };
  }

  const incoming = parseData(data);

  // Older clients send no `since`; they get the plain merge.
  const base =
    since === null ? null : typeof since === "number" && Number.isFinite(since) ? since : undefined;
  const device =
    typeof deviceId === "string" && DEVICE_ID_PATTERN.test(deviceId) ? deviceId : null;

  const { merged, conflicts } = await withLock(spaceId, async () => {
    const stored = (await repo.get(spaceId)) ?? emptyData();
    let result = mergeData(stored, incoming);
    // Text that last-write-wins would overwrite is kept as a separate note.
    const lost = base === undefined ? [] : findLostEdits(incoming, stored, base, device);
    if (lost.length > 0) {
      const at = now();
      const copies = lost.map((n) => conflictCopy(n, at));
      result = mergeData(result, { notes: copies, folders: [], tombstones: {} });
    }
    await repo.put(spaceId, result);
    return { merged: result, conflicts: lost.map((n) => n.title.trim() || "Untitled") };
  });

  return {
    status: 200,
    body: { data: merged, syncedAt: now(), ...(conflicts.length > 0 && { conflicts }) },
  };
}

export function createMemoryRepository(): SyncRepository & { spaces: Map<string, NotesData> } {
  const spaces = new Map<string, NotesData>();
  return {
    spaces,
    async get(id) {
      const data = spaces.get(id);
      return data ? structuredClone(data) : null;
    },
    async put(id, data) {
      spaces.set(id, structuredClone(data));
    },
  };
}
