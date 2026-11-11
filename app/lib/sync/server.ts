import type { NotesData } from "@/app/types/note";
import { emptyData, mergeData } from "@/app/lib/notes/merge";
import { parseData } from "@/app/lib/notes/storage";
import { SYNC_KEY_PATTERN, type SyncResponse } from "@/app/lib/sync/protocol";
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
  const { key, data } = body as { key?: unknown; data?: unknown };
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

  const merged = await withLock(spaceId, async () => {
    const stored = (await repo.get(spaceId)) ?? emptyData();
    const result = mergeData(stored, incoming);
    await repo.put(spaceId, result);
    return result;
  });

  return { status: 200, body: { data: merged, syncedAt: now() } };
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
