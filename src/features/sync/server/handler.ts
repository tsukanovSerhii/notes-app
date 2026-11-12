import { mergeData } from "@/features/notes/model/merge";
import {
  DEVICE_ID_PATTERN,
  PROTOCOL_VERSION,
  SYNC_KEY_PATTERN,
  type SyncResponse,
} from "@/features/sync/shared/protocol";
import { emptySealedData, parseSealedData, type SealedData, type SealedFolder, type SealedNote } from "@/features/sync/shared/wire";
import { conflictCopy, findLostEdits } from "@/features/sync/server/conflicts";
import {
  changedKeys,
  deltaSince,
  emptySpace,
  guardAgainstPruned,
  pruneTombstones,
  type StoredSpace,
} from "@/features/sync/server/space";
import type { RateLimiter } from "@/features/sync/server/rateLimit";

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
  /** Removes a space; used to drop plaintext spaces left by earlier builds. */
  delete(spaceId: string): Promise<void>;
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
  incomingRaw: SealedData,
  base: number | null | undefined,
  device: string | null,
  at: number
) {
  const incoming = guardAgainstPruned(incomingRaw, stored, base);
  const merge = (a: SealedData, b: SealedData) => mergeData<SealedNote, SealedFolder>(a, b);
  let data = merge(stored.data, incoming);
  // Text that last-write-wins would overwrite is kept as a separate note.
  // The server cannot read text; it compares the devices' keyed text hashes.
  const lost =
    base === undefined ? [] : findLostEdits(incoming, stored.data, base, device, (n) => n.textHash);
  if (lost.length > 0) {
    data = merge(data, { notes: lost.map((n) => conflictCopy(n, at)), folders: [], tombstones: {} });
  }

  const changed = changedKeys(stored.data, data);
  if (stored.version > 0 && changed.length === 0 && pruneTombstones(stored, at) === stored) {
    // Nothing new in either direction (a device polling): the stored space stays as it is, so
    // it is neither rewritten nor given a new version.
    return { space: stored, lost, unchanged: true as const };
  }

  const version = stored.version + 1;
  const changes = { ...stored.changes };
  for (const key of changed) changes[key] = version;
  // Forget change records of entities that no longer exist.
  const alive = new Set([
    ...data.notes.map((n) => "n:" + n.id),
    ...data.folders.map((f) => "f:" + f.id),
    ...Object.keys(data.tombstones).map((id) => "t:" + id),
  ]);
  for (const key of Object.keys(changes)) if (!alive.has(key)) delete changes[key];

  const space = pruneTombstones({ version, data, changes, horizon: stored.horizon, revokedAt: null }, at);
  return { space, lost, unchanged: false as const };
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
  const { v, key, data, since, deviceId, cursor, forgetLegacy, revoke } = body as {
    v?: unknown;
    key?: unknown;
    data?: unknown;
    since?: unknown;
    deviceId?: unknown;
    cursor?: unknown;
    forgetLegacy?: unknown;
    revoke?: unknown;
  };
  // Earlier builds sent the sync key itself and plaintext notes. Merging
  // those with sealed data would corrupt both, so they are turned away.
  if (v !== PROTOCOL_VERSION) {
    return { status: 426, body: { error: "This version of NoteVoid is out of date. Reload the page." } };
  }
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

  const gone = (): SyncResult => ({
    status: 410,
    body: { error: "This sync key was replaced on another device.", revoked: true },
  });

  if (revoke === true) {
    // Retires the space: whoever holds its key may do this, which is the point of rotating it.
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const found = await repo.get(spaceId);
      const stored = found ?? emptySpace();
      const retired = { ...emptySpace(), version: stored.version + 1, revokedAt: found?.revokedAt ?? now() };
      if (await repo.put(spaceId, retired, found ? stored.version : null)) {
        return { status: 200, body: { data: emptySealedData(), syncedAt: now(), cursor: retired.version, revoked: true } };
      }
    }
    return { status: 503, body: { error: "The sync space is busy. Try again shortly." } };
  }

  const incoming = parseSealedData(data);
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
      if (stored.revokedAt !== null) return "revoked" as const;
      const { space, lost, unchanged } = nextSpace(stored, incoming, base, device, now());
      if (unchanged || (await repo.put(spaceId, space, found ? stored.version : null))) return { space, lost };
    }
    return null;
  });
  if (outcome === "revoked") return gone();
  if (!outcome) {
    return { status: 503, body: { error: "The sync space is busy. Try again shortly." } };
  }

  // A device upgrading from plaintext sync asks, once, for its old space to
  // be erased. It proves it knew the old key by naming the space's id (a
  // hash of that key), which only the server stored; the key is never sent.
  if (typeof forgetLegacy === "string" && /^[a-f0-9]{64}$/.test(forgetLegacy) && forgetLegacy !== spaceId) {
    await repo.delete(forgetLegacy);
  }

  const { space, lost } = outcome;
  // A cursor ahead of the space means the server lost data; resend it all.
  const full = from === null || from > space.version;
  // Ids, not titles: the server cannot read titles. Devices look them up.
  const conflicts = lost.map((n) => n.id);
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
    async delete(id) {
      spaces.delete(id);
    },
  };
}
