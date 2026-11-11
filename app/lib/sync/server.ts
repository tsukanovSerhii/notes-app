import { mergeData } from "@/app/lib/notes/merge";
import { parseData } from "@/app/lib/notes/storage";
import { DEVICE_ID_PATTERN, SYNC_KEY_PATTERN, type SyncResponse } from "@/app/lib/sync/protocol";
import { conflictCopy, findLostEdits } from "@/app/lib/sync/conflicts";
import {
  changedKeys,
  deltaSince,
  emptySpace,
  guardAgainstPruned,
  pruneTombstones,
  type StoredSpace,
} from "@/app/lib/sync/space";
import type { RateLimiter } from "@/app/lib/sync/rateLimit";

/**
 * Where sync spaces live. Writes are conditional on the version that was
 * read, so several server instances can share one database: a write that
 * lost a race returns false and the handler retries with fresh data.
 */
export interface SyncRepository {
  get(spaceId: string): Promise<StoredSpace | null>;
  /**
   * Stores `space` only if the stored version is still `expected` (null:
   * the space must not exist yet). Returns false when another write won.
   */
  put(spaceId: string, space: StoredSpace, expected: number | null): Promise<boolean>;
}

export interface SyncResult {
  status: number;
  body: SyncResponse | { error: string };
  /** Set with status 429. */
  retryAfterSec?: number;
}

const MAX_ATTEMPTS = 5;

/**
 * Serializes read-merge-write per space within this process, so concurrent
 * requests rarely reach the repository's version check at all.
 */
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

/** Builds the next stored space from the stored one and a device's replica. */
function nextSpace(
  stored: StoredSpace,
  incomingRaw: ReturnType<typeof parseData>,
  base: number | null | undefined,
  device: string | null,
  at: number
) {
  const incoming = guardAgainstPruned(incomingRaw, stored, base);
  let data = mergeData(stored.data, incoming);
  // Text that last-write-wins would overwrite is kept as a separate note.
  const lost = base === undefined ? [] : findLostEdits(incoming, stored.data, base, device);
  if (lost.length > 0) {
    data = mergeData(data, { notes: lost.map((n) => conflictCopy(n, at)), folders: [], tombstones: {} });
  }

  const version = stored.version + 1;
  const changes = { ...stored.changes };
  for (const key of changedKeys(stored.data, data)) changes[key] = version;
  // Forget change records of entities that no longer exist.
  const alive = new Set([
    ...data.notes.map((n) => "n:" + n.id),
    ...data.folders.map((f) => "f:" + f.id),
    ...Object.keys(data.tombstones).map((id) => "t:" + id),
  ]);
  for (const key of Object.keys(changes)) if (!alive.has(key)) delete changes[key];

  const space = pruneTombstones({ version, data, changes, horizon: stored.horizon }, at);
  return { space, lost };
}

/**
 * Merges the client's replica (all of it, or what changed since its last
 * sync) into the stored one, and answers with what the client is missing:
 * everything after its cursor, or the whole space if it has none. The key is
 * never stored: data is filed under a hash of it.
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
  const { key, data, since, deviceId, cursor } = body as {
    key?: unknown;
    data?: unknown;
    since?: unknown;
    deviceId?: unknown;
    cursor?: unknown;
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
  // Older clients send no `since`; they get no conflict copies.
  const base =
    since === null ? null : typeof since === "number" && Number.isFinite(since) ? since : undefined;
  const device =
    typeof deviceId === "string" && DEVICE_ID_PATTERN.test(deviceId) ? deviceId : null;
  const from = typeof cursor === "number" && Number.isInteger(cursor) && cursor >= 0 ? cursor : null;

  const outcome = await withLock(spaceId, async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const found = await repo.get(spaceId);
      const stored = found ?? emptySpace();
      const { space, lost } = nextSpace(stored, incoming, base, device, now());
      if (await repo.put(spaceId, space, found ? stored.version : null)) return { space, lost };
    }
    return null;
  });
  if (!outcome) {
    return { status: 503, body: { error: "The sync space is busy. Try again shortly." } };
  }

  const { space, lost } = outcome;
  // A cursor ahead of the space means the server lost data; resend it all.
  const full = from === null || from > space.version;
  const conflicts = lost.map((n) => n.title.trim() || "Untitled");
  return {
    status: 200,
    body: {
      data: full ? space.data : deltaSince(space, from),
      syncedAt: now(),
      cursor: space.version,
      ...(conflicts.length > 0 && { conflicts }),
    },
  };
}

export function createMemoryRepository(): SyncRepository & { spaces: Map<string, StoredSpace> } {
  const spaces = new Map<string, StoredSpace>();
  return {
    spaces,
    async get(id) {
      const space = spaces.get(id);
      return space ? structuredClone(space) : null;
    },
    async put(id, space, expected) {
      const current = spaces.get(id);
      if ((current?.version ?? null) !== expected) return false;
      spaces.set(id, structuredClone(space));
      return true;
    },
  };
}
