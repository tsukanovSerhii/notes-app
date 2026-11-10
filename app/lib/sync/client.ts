import type { NotesStore, Timers } from "@/app/lib/notes/store";
import {
  SYNC_KEY_PATTERN,
  generateSyncKey,
  type SyncResponse,
} from "@/app/lib/sync/protocol";
import { parseData } from "@/app/lib/notes/storage";

export const SYNC_KEY_STORAGE = "notevoid-sync-key";

export type SyncState = "off" | "idle" | "syncing" | "error" | "offline";

export interface SyncSnapshot {
  state: SyncState;
  key: string | null;
  lastSyncedAt: number | null;
  error: string | null;
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

const OFF: SyncSnapshot = { state: "off", key: null, lastSyncedAt: null, error: null };

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
}: SyncClientOptions): SyncClient {
  let loaded = false;
  let snapshot: SyncSnapshot = OFF;
  let inFlight: Promise<void> | null = null;
  let again = false;
  let timer: unknown = null;
  let unsubscribeData: (() => void) | null = null;
  const listeners = new Set<() => void>();

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
      attach();
    }
  };

  const attach = () => {
    unsubscribeData ??= store.subscribeData(() => client.scheduleSync());
  };

  const round = async (key: string) => {
    if (!isOnline()) {
      set({ state: "offline" });
      return;
    }
    set({ state: "syncing", error: null });
    await store.start();
    try {
      const res = await fetchFn(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, data: store.getData() }),
      });
      const json = (await res.json().catch(() => null)) as
        | (SyncResponse & { error?: string })
        | null;
      if (!res.ok || !json) {
        throw new Error(json?.error ?? `Sync failed (${res.status})`);
      }
      if (snapshot.key !== key) return; // disabled or switched mid-request
      store.merge(parseData(json.data), "sync");
      set({ state: "idle", lastSyncedAt: json.syncedAt ?? Date.now() });
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
      loaded = true;
      set({ state: "idle", key: next, error: null, lastSyncedAt: null });
      attach();
      await client.syncNow();
      return true;
    },

    disable() {
      keyStorage?.removeItem(SYNC_KEY_STORAGE);
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
      if (timer) timers.clearTimeout(timer);
      timer = timers.setTimeout(() => void client.syncNow(), debounceMs);
    },
  };

  return client;
}
