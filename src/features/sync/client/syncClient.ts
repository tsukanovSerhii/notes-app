import type { NotesStore, Timers } from "@/features/notes/state/store";
import type { NotesData } from "@/features/notes/model/types";
import {
  PROTOCOL_VERSION,
  SYNC_KEY_PATTERN,
  generateSyncKey,
  type SyncResponse,
} from "@/features/sync/shared/protocol";
import { deriveSyncKeys, openData, sealData, type SyncKeys } from "@/features/sync/client/crypto";
import { parseSealedData } from "@/features/sync/shared/wire";

export const SYNC_KEY_STORAGE = "notevoid-sync-key";
/** When the last snapshot the server has merged was taken (corrected clock). */
export const SYNC_BASE_STORAGE = "notevoid-sync-base";
/** The key whose plaintext space from earlier builds has been erased. */
export const SYNC_E2EE_STORAGE = "notevoid-sync-e2ee";

/** The id earlier builds filed a space under: SHA-256 of the raw sync key. */
async function legacySpaceId(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type SyncState = "off" | "idle" | "syncing" | "error" | "offline";

export interface SyncSnapshot {
  state: SyncState;
  key: string | null;
  lastSyncedAt: number | null;
  error: string | null;
  /** Notes whose local text lost to a concurrent edit and was kept as a copy. */
  lastConflict: { titles: string[]; at: number } | null;
  /** Set while the server is rate limiting this device: when the retry is due. */
  retryAt: number | null;
}

export interface SyncClientOptions {
  store: Pick<NotesStore, "start" | "getData" | "merge" | "subscribeData">;
  fetch: typeof fetch;
  keyStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  endpoint?: string;
  /** Wait after the last local edit before pushing. */
  debounceMs?: number;
  timers?: Timers;
  isOnline?: () => boolean;
  /** Reports the server time with the raw local send/receive times of a round trip. */
  onServerTime?: (serverTime: number, sentAt: number, receivedAt: number) => void;
  /** Uncorrected local clock, used to time round trips. */
  rawNow?: () => number;
  /** The app's (skew-corrected) clock, the one note timestamps come from. */
  now?: () => number;
  /** This device's id, sent so the server can tell whose edits conflict. */
  deviceId?: string | null;
}

export interface SyncClient {
  subscribe(listener: () => void): () => void;
  getSnapshot(): SyncSnapshot;
  getServerSnapshot(): SyncSnapshot;
  /** Turns sync on with a new key, or joins an existing space with `key`. */
  enable(key?: string): Promise<boolean>;
  disable(): void;
  syncNow(): Promise<void>;
  /** Called when local data changes. */
  scheduleSync(): void;
}

/**
 * The entities changed at or after `since`. Every local change is stamped by
 * a clock that never runs backwards within a session, so anything changed
 * after the last snapshot is included; things received from the server may
 * be sent back too, which the merge makes harmless.
 */
export function changedSince(data: NotesData, since: number): NotesData {
  const tombstones: NotesData["tombstones"] = {};
  for (const [id, at] of Object.entries(data.tombstones)) if (at >= since) tombstones[id] = at;
  return {
    notes: data.notes.filter((n) => n.updatedAt >= since),
    folders: data.folders.filter((f) => f.updatedAt >= since),
    tombstones,
  };
}

const OFF: SyncSnapshot = {
  state: "off",
  key: null,
  lastSyncedAt: null,
  error: null,
  lastConflict: null,
  retryAt: null,
};

const defaultTimers: Timers = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Pushes the local replica to the server and merges back what it returns.
 * The server merge is commutative, so the only rule is: whenever something
 * changed, sync again. Requests never overlap; a change made during a request
 * queues one more round.
 */
export function createSyncClient({
  store,
  fetch: fetchFn,
  keyStorage,
  endpoint = "/api/sync",
  debounceMs = 1500,
  timers = defaultTimers,
  isOnline = () => typeof navigator === "undefined" || navigator.onLine,
  onServerTime,
  rawNow = Date.now,
  now = Date.now,
  deviceId = null,
}: SyncClientOptions): SyncClient {
  let loaded = false;
  let snapshot: SyncSnapshot = OFF;
  let inFlight: Promise<void> | null = null;
  let again = false;
  let timer: unknown = null;
  let unsubscribeData: (() => void) | null = null;
  const listeners = new Set<() => void>();
  let base: number | null = null;
  /**
   * The space version last received. Kept in memory only, so the first sync
   * after a page load is always a full exchange in both directions.
   */
  let cursor: number | null = null;
  let keys: { key: string; value: Promise<SyncKeys> } | null = null;
  const keysFor = (key: string) => {
    if (keys?.key !== key) keys = { key, value: deriveSyncKeys(key) };
    return keys.value;
  };
  const storageGet = (k: string) => {
    try {
      return keyStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  };
  const storageSet = (k: string, v: string | null) => {
    try {
      if (v === null) keyStorage?.removeItem(k);
      else keyStorage?.setItem(k, v);
    } catch {
      // Best effort: worst case the legacy cleanup is asked for again.
    }
  };

  const setBase = (value: number | null) => {
    base = value;
    try {
      if (value === null) keyStorage?.removeItem(SYNC_BASE_STORAGE);
      else keyStorage?.setItem(SYNC_BASE_STORAGE, String(value));
    } catch {
      // Without a stored base the next sync is cautious and may keep extra copies.
    }
  };

  const set = (next: Partial<SyncSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((l) => l());
  };

  const load = () => {
    if (loaded || !keyStorage) return;
    loaded = true;
    const key = keyStorage.getItem(SYNC_KEY_STORAGE);
    if (key && SYNC_KEY_PATTERN.test(key)) {
      snapshot = { ...OFF, state: "idle", key };
      const stored = Number(keyStorage.getItem(SYNC_BASE_STORAGE));
      base = Number.isFinite(stored) && stored > 0 ? stored : null;
      attach();
    }
  };

  const attach = () => {
    unsubscribeData ??= store.subscribeData(() => client.scheduleSync());
  };

  const retryIn = (ms: number) => {
    if (timer) timers.clearTimeout(timer);
    timer = timers.setTimeout(() => void client.syncNow(), ms);
  };

  const round = async (key: string) => {
    if (!isOnline()) {
      set({ state: "offline" });
      return;
    }
    set({ state: "syncing", error: null });
    await store.start();
    try {
      const k = await keysFor(key);
      const snapshotAt = now();
      const local = store.getData();
      const payload = await sealData(k, cursor === null || base === null ? local : changedSince(local, base));
      // Once per key, ask the server to erase what earlier builds stored in plaintext.
      const legacy = storageGet(SYNC_E2EE_STORAGE) === key ? null : await legacySpaceId(key);
      const sentAt = rawNow();
      const res = await fetchFn(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          v: PROTOCOL_VERSION,
          key: k.spaceToken,
          data: payload,
          since: base,
          cursor,
          ...(deviceId && { deviceId }),
          ...(legacy && { forgetLegacy: legacy }),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | (SyncResponse & { error?: string })
        | null;
      if (res.status === 429) {
        // Rate limited: come back when the server says so instead of waiting
        // for the next poll or edit.
        const wait = Number(res.headers.get("Retry-After"));
        const ms = (Number.isFinite(wait) && wait > 0 ? wait : 5) * 1000;
        retryIn(ms);
        set({ retryAt: rawNow() + ms });
      }
      if (!res.ok || !json) {
        throw new Error(json?.error ?? `Sync failed (${res.status})`);
      }
      if (typeof json.syncedAt === "number") onServerTime?.(json.syncedAt, sentAt, rawNow());
      if (snapshot.key !== key) return; // disabled or switched mid-request
      const { data: remote, rejected } = await openData(k, parseSealedData(json.data));
      if (snapshot.key !== key) return;
      store.merge(remote, "sync");
      setBase(snapshotAt);
      if (legacy) storageSet(SYNC_E2EE_STORAGE, key);
      cursor = typeof json.cursor === "number" ? json.cursor : null;

      // The server names conflicting notes by id; only we can read their titles.
      const ids = Array.isArray(json.conflicts) ? json.conflicts.filter((t) => typeof t === "string") : [];
      const titles = new Map(store.getData().notes.map((n) => [n.id, n.title.trim() || "Untitled"]));
      const conflicts = ids.map((id) => titles.get(id) ?? "Untitled");
      set({
        state: rejected > 0 ? "error" : "idle",
        error:
          rejected > 0
            ? `${rejected} synced ${rejected === 1 ? "item" : "items"} could not be decrypted and ${rejected === 1 ? "was" : "were"} skipped.`
            : null,
        retryAt: null,
        lastSyncedAt: json.syncedAt ?? Date.now(),
        ...(conflicts.length > 0 && { lastConflict: { titles: conflicts, at: now() } }),
      });
    } catch (error) {
      if (snapshot.key !== key) return;
      const offline = error instanceof TypeError || !isOnline();
      set({
        state: offline ? "offline" : "error",
        error: offline ? null : (error as Error).message,
      });
    }
  };

  const client: SyncClient = {
    subscribe(listener) {
      load();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      load();
      return snapshot;
    },
    getServerSnapshot: () => OFF,

    async enable(key) {
      const next = key?.trim() || generateSyncKey();
      if (!SYNC_KEY_PATTERN.test(next)) {
        set({ error: "That does not look like a sync key." });
        return false;
      }
      keyStorage?.setItem(SYNC_KEY_STORAGE, next);
      // A brand-new key has no plaintext past to clean up.
      if (!key) storageSet(SYNC_E2EE_STORAGE, next);
      setBase(null);
      cursor = null;
      loaded = true;
      set({ state: "idle", key: next, error: null, lastSyncedAt: null });
      attach();
      await client.syncNow();
      return true;
    },

    disable() {
      keyStorage?.removeItem(SYNC_KEY_STORAGE);
      storageSet(SYNC_E2EE_STORAGE, null);
      setBase(null);
      cursor = null;
      if (timer) timers.clearTimeout(timer);
      timer = null;
      unsubscribeData?.();
      unsubscribeData = null;
      set(OFF);
    },

    async syncNow() {
      load();
      if (timer) {
        timers.clearTimeout(timer);
        timer = null;
      }
      const key = snapshot.key;
      if (!key) return;
      if (inFlight) {
        again = true;
        return inFlight;
      }
      inFlight = (async () => {
        do {
          again = false;
          await round(key);
        } while (again && snapshot.key === key);
      })().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },

    scheduleSync() {
      if (!snapshot.key) return;
      retryIn(debounceMs);
    },
  };

  return client;
}
